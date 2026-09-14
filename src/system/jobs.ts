import { create } from 'zustand'
import { nanoid } from 'nanoid'

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

export const useJobs = create<JobsState>((set, get) => ({
  jobs: {},
  cards: [],

  start: (job) => {
    const id = job.id ?? nanoid(6)
    set((s) => ({ jobs: { ...s.jobs, [id]: { ...job, id, status: 'running', startedAt: Date.now() } } }))
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
    set((s) => ({
      jobs: { ...s.jobs, [id]: finished },
      cards: quiet
        ? s.cards
        : [
            ...s.cards.slice(-(MAX_CARDS - 1)),
            { id: nanoid(6), jobId: id, title: finished.title, detail: finished.detail, kind: status === 'error' ? 'error' : 'done', open: finished.open, at: Date.now() },
          ],
    }))
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
