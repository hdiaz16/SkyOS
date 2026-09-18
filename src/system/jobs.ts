import { create } from 'zustand'
import { nanoid } from 'nanoid'
import { play } from './sound'
import { sessionSuffix } from './session'

/**
 * Background work the desktop keeps track of: reading documents, indexing, AI tasks that finish while the
 * person does something else. Each job reports progress; when one ends, a card says so unless it was quiet.
 */

export type JobKind = 'read' | 'index' | 'ai' | 'sync'
export type JobStatus = 'running' | 'done' | 'error'

export interface Job {
  id: string
  kind: JobKind
  title: string
  detail?: string
  status: JobStatus
  /** 0..1 when known. */
  progress?: number
  startedAt: number
  finishedAt?: number
  /** Brings the result to the front. */
  open?: () => void
  /** Whether finishing should announce itself with a card. */
  quiet?: boolean
}

export interface JobCard {
  id: string
  jobId: string
  title: string
  detail?: string
  kind: 'done' | 'error'
  open?: () => void
  at: number
}

interface FinishOptions {
  detail?: string
  open?: () => void
  error?: string
  quiet?: boolean
}

interface JobsState {
  jobs: Record<string, Job>
  cards: JobCard[]
  start: (job: Omit<Job, 'id' | 'status' | 'startedAt'> & { id?: string }) => string
  update: (id: string, patch: Partial<Pick<Job, 'title' | 'detail' | 'progress' | 'open' | 'quiet'>>) => void
  finish: (id: string, opts?: FinishOptions) => void
  dismissCard: (id: string) => void
  /** Drops finished jobs older than a while so the list stays short. */
  sweep: () => void
}

const KEEP_FINISHED_MS = 10 * 60_000
const MAX_CARDS = 4

/**
 * Background work lives in this tab and dies with it: there is no server to carry on. Pretending otherwise
 * would be the worst outcome, so the ones that were running are written down, and on the next boot they come
 * back as what they are — interrupted — instead of disappearing as if they had finished.
 */
/**
 * Per tab, not per account. With two tabs of the same person open —ordinary in a web desktop— a new tab used
 * to read the list of the other one, announce «se interrumpió al cerrar la pestaña» about work that was
 * running right then, and wipe the record in the process. sessionStorage belongs to one tab and dies with it,
 * which is exactly the lifetime of this work.
 */
const RUNNING_KEY = `mesa:trabajos${sessionSuffix()}`

const runningStore = (): Storage | null => {
  try {
    return window.sessionStorage
  } catch {
    return null
  }
}

interface Interrupted {
  title: string
  detail?: string
  startedAt: number
}

function remember(jobs: Record<string, Job>): void {
  const store = runningStore()
  if (!store) return
  try {
    const running = Object.values(jobs)
      .filter((j) => j.status === 'running')
      .map<Interrupted>((j) => ({ title: j.title, detail: j.detail, startedAt: j.startedAt }))
    if (running.length) store.setItem(RUNNING_KEY, JSON.stringify(running))
    else store.removeItem(RUNNING_KEY)
  } catch {
    // Without storage the desktop simply forgets, which is where it started.
  }
}

/**
 * What was running when the tab went away. Called once at boot: the work cannot be resumed — nothing kept the
 * documents, the model call or the progress — so each one says so and the person decides whether to ask again.
 */
export function recoverJobs(): void {
  let pending: Interrupted[] = []
  const store = runningStore()
  if (!store) return
  try {
    const raw = store.getItem(RUNNING_KEY)
    store.removeItem(RUNNING_KEY)
    // Anything left in the old shared place belongs to no tab in particular; clear it once and forget it.
    localStorage.removeItem(RUNNING_KEY)
    if (raw) pending = JSON.parse(raw) as Interrupted[]
  } catch {
    return
  }
  if (!pending.length) return
  useJobs.setState((s) => ({
    cards: [
      ...s.cards,
      ...pending.slice(-MAX_CARDS).map((j) => ({
        id: nanoid(6),
        jobId: nanoid(6),
        title: j.title,
        detail: 'Se interrumpió al cerrar la pestaña; vuelve a pedirlo cuando quieras.',
        kind: 'error' as const,
        at: Date.now(),
      })),
    ],
  }))
}

export const useJobs = create<JobsState>((set, get) => ({
  jobs: {},
  cards: [],

  start: (job) => {
    const id = job.id ?? nanoid(6)
    set((s) => ({ jobs: { ...s.jobs, [id]: { ...job, id, status: 'running', startedAt: Date.now() } } }))
    remember(get().jobs)
    return id
  },

  update: (id, patch) => set((s) => (s.jobs[id] ? { jobs: { ...s.jobs, [id]: { ...s.jobs[id], ...patch } } } : s)),

  finish: (id, opts = {}) => {
    const job = get().jobs[id]
    if (!job || job.status !== 'running') return
    const status: JobStatus = opts.error ? 'error' : 'done'
    const finished: Job = {
      ...job,
      status,
      finishedAt: Date.now(),
      progress: 1,
      detail: opts.error ?? opts.detail ?? job.detail,
      open: opts.open ?? job.open,
    }
    const quiet = opts.quiet ?? job.quiet
    if (!quiet) play(status === 'error' ? 'error' : 'done')
    // What the notifications permission was asked for at entry: the tab in the background would otherwise
    // miss the chime and the card both. Clicking brings the desktop back and opens what the job made.
    if (!quiet && document.hidden && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      try {
        const note = new Notification(finished.title, {
          body: status === 'error' ? finished.detail ?? 'Algo no salió bien' : finished.detail ?? 'Terminado',
          tag: id,
        })
        note.onclick = () => {
          window.focus()
          finished.open?.()
        }
      } catch {
        // Some platforms want a service worker for this; the card and the chime still exist.
      }
    }
    set((s) => ({
      jobs: { ...s.jobs, [id]: finished },
      cards: quiet
        ? s.cards
        : [
            ...s.cards.slice(-(MAX_CARDS - 1)),
            { id: nanoid(6), jobId: id, title: finished.title, detail: finished.detail, kind: status === 'error' ? 'error' : 'done', open: finished.open, at: Date.now() },
          ],
    }))
    remember(get().jobs)
    get().sweep()
  },

  dismissCard: (id) => set((s) => ({ cards: s.cards.filter((c) => c.id !== id) })),

  sweep: () =>
    set((s) => {
      const cutoff = Date.now() - KEEP_FINISHED_MS
      const jobs = Object.fromEntries(Object.entries(s.jobs).filter(([, j]) => j.status === 'running' || (j.finishedAt ?? 0) > cutoff))
      return { jobs }
    }),
}))

/** Jobs still running, most recent first. */
export const runningJobs = (jobs: Record<string, Job>): Job[] =>
  Object.values(jobs)
    .filter((j) => j.status === 'running')
    .sort((a, b) => b.startedAt - a.startedAt)

/** Finished jobs, most recent first. */
export const finishedJobs = (jobs: Record<string, Job>): Job[] =>
  Object.values(jobs)
    .filter((j) => j.status !== 'running')
    .sort((a, b) => (b.finishedAt ?? 0) - (a.finishedAt ?? 0))
