/// <reference lib="webworker" />
import { env, pipeline, type FeatureExtractionPipeline } from '@huggingface/transformers'

/**
 * The embedding model runs here, off the main thread, so indexing never freezes the desktop. The model
 * (multilingual, ~120 MB quantized) downloads once from the Hugging Face hub and stays in the browser cache.
 */

env.allowLocalModels = false

const MODEL = 'Xenova/multilingual-e5-small'

type Request = { id: number; type: 'embed'; texts: string[] } | { id: number; type: 'warm' }

type Response =
  | { id: number; type: 'result'; vectors: number[][] }
  | { id: number; type: 'ready' }
  | { id: number; type: 'error'; message: string }
  | { type: 'progress'; loaded: number; total: number; file?: string }

const post = (message: Response) => self.postMessage(message)

let extractor: Promise<FeatureExtractionPipeline> | null = null

function load(): Promise<FeatureExtractionPipeline> {
  extractor ??= pipeline('feature-extraction', MODEL, {
    dtype: 'q8',
    progress_callback: (p) => {
      const info = p as { status?: string; loaded?: number; total?: number; file?: string }
      if (info.status === 'progress' && info.total) post({ type: 'progress', loaded: info.loaded ?? 0, total: info.total, file: info.file })
    },
  }) as Promise<FeatureExtractionPipeline>
  return extractor
}

self.onmessage = async (e: MessageEvent<Request>) => {
  const msg = e.data
  try {
    const model = await load()
    if (msg.type === 'warm') {
      post({ id: msg.id, type: 'ready' })
      return
    }
    const out = await model(msg.texts, { pooling: 'mean', normalize: true })
    post({ id: msg.id, type: 'result', vectors: out.tolist() as number[][] })
  } catch (err) {
    post({ id: msg.id, type: 'error', message: err instanceof Error ? err.message : String(err) })
  }
}
