/// <reference lib="webworker" />
import * as pdfjs from 'pdfjs-dist'
import { strFromU8, unzipSync } from 'fflate'
import { read, utils } from 'xlsx'

/**
 * Text extraction off the main thread: PDFs through pdf.js, Word and PowerPoint by unzipping their XML, Excel
 * through SheetJS. The desktop stays fluid while a 300-page PDF is read; the text feeds search, summaries and
 * whatever Sky is asked about the file.
 */

// pdf.js parses in its own worker, nested under this one; if the browser refuses, it falls back to this thread.
pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString()

export type ExtractKind = 'pdf' | 'document' | 'spreadsheet' | 'presentation'

type Request = { id: number; kind: ExtractKind; name: string; buffer: ArrayBuffer }

type Response =
  | { id: number; type: 'result'; text: string; pages?: number }
  | { id: number; type: 'error'; message: string }
  | { id: number; type: 'progress'; done: number; total: number }

const MAX_CHARS = 300_000
const MAX_SHEET_ROWS = 2000

const post = (m: Response) => self.postMessage(m)

const decodeEntities = (s: string) =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, '&')

const tidy = (s: string) => s.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()

async function pdf(id: number, buffer: ArrayBuffer): Promise<{ text: string; pages: number }> {
  const task = pdfjs.getDocument({ data: new Uint8Array(buffer) })
  const doc = await task.promise
  const parts: string[] = []
  let chars = 0
  for (let p = 1; p <= doc.numPages && chars < MAX_CHARS; p++) {
    const page = await doc.getPage(p)
    const content = await page.getTextContent()
    const lines: string[] = []
    let line = ''
    for (const item of content.items) {
      if (!('str' in item)) continue
      line += item.str
      if (item.hasEOL) {
        lines.push(line)
        line = ''
      } else if (item.str && !item.str.endsWith(' ')) {
        line += ' '
      }
    }
    if (line) lines.push(line)
    const text = lines.join('\n').trim()
    if (text) {
      parts.push(`— Página ${p} —\n${text}`)
      chars += text.length
    }
    page.cleanup()
    post({ id, type: 'progress', done: p, total: doc.numPages })
  }
  const pages = doc.numPages
  await task.destroy()
  return { text: tidy(parts.join('\n\n')), pages }
}

/** OOXML to text: paragraphs become lines, tabs stay tabs, tags go, entities come back. */
function xmlText(xml: string, paragraph: RegExp): string {
  return decodeEntities(xml.replace(paragraph, '\n').replace(/<w:tab\/>/g, '\t').replace(/<[^>]+>/g, ''))
}

function docx(buffer: ArrayBuffer): string {
  const files = unzipSync(new Uint8Array(buffer), { filter: (f) => f.name === 'word/document.xml' })
  const main = files['word/document.xml']
  if (!main) throw new Error('El documento no trae texto legible')
  return tidy(xmlText(strFromU8(main), /<\/w:p>/g))
}

function pptx(buffer: ArrayBuffer): { text: string; pages: number } {
  const files = unzipSync(new Uint8Array(buffer), { filter: (f) => /^ppt\/slides\/slide\d+\.xml$/.test(f.name) })
  const slideNumber = (name: string) => Number(name.match(/\d+/)?.[0] ?? 0)
  const names = Object.keys(files).sort((a, b) => slideNumber(a) - slideNumber(b))
  const parts = names.map((n, i) => `— Diapositiva ${i + 1} —\n${tidy(xmlText(strFromU8(files[n]), /<\/a:p>/g))}`)
  return { text: tidy(parts.join('\n\n')), pages: names.length }
}

function xlsx(buffer: ArrayBuffer): string {
  const wb = read(new Uint8Array(buffer), { type: 'array' })
  const parts: string[] = []
  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name]
    if (!ws) continue
    const ref = ws['!ref']
    if (ref) {
      const range = utils.decode_range(ref)
      if (range.e.r - range.s.r > MAX_SHEET_ROWS) {
        range.e.r = range.s.r + MAX_SHEET_ROWS
        ws['!ref'] = utils.encode_range(range)
      }
    }
    const csv = utils.sheet_to_csv(ws, { blankrows: false })
    if (csv.trim()) parts.push(`## Hoja: ${name}\n${csv}`)
  }
  return tidy(parts.join('\n\n'))
}

self.onmessage = async (e: MessageEvent<Request>) => {
  const { id, kind, buffer } = e.data
  try {
    if (kind === 'pdf') {
      const r = await pdf(id, buffer)
      post({ id, type: 'result', text: r.text.slice(0, MAX_CHARS), pages: r.pages })
    } else if (kind === 'document') {
      post({ id, type: 'result', text: docx(buffer).slice(0, MAX_CHARS) })
    } else if (kind === 'presentation') {
      const r = pptx(buffer)
      post({ id, type: 'result', text: r.text.slice(0, MAX_CHARS), pages: r.pages })
    } else {
      post({ id, type: 'result', text: xlsx(buffer).slice(0, MAX_CHARS) })
    }
  } catch (err) {
    post({ id, type: 'error', message: err instanceof Error ? err.message : String(err) })
  }
}
