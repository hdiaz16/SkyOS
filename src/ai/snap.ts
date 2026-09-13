import { create } from 'zustand'
import type { ImagePart } from './types'

/**
 * Snap context: capture what is on screen, let the user pick a region and hand it to Mesa as an image.
 * Uses the browser's own screen-capture permission flow; nothing leaves the device until the user sends it.
 */

const MAX_EDGE = 1568

interface SnapState {
  /** Full capture as a data URL while the region picker is open. */
  image: string | null
  width: number
  height: number
  open: (image: string, width: number, height: number) => void
  close: () => void
}

export const useSnap = create<SnapState>((set) => ({
  image: null,
  width: 0,
  height: 0,
  open: (image, width, height) => set({ image, width, height }),
  close: () => set({ image: null, width: 0, height: 0 }),
}))

type DisplayMediaOptions = MediaStreamConstraints & { preferCurrentTab?: boolean; selfBrowserSurface?: 'include' | 'exclude' }

/** Grabs one frame of the screen the user chooses. Resolves null when the user cancels. */
export async function captureScreen(): Promise<{ dataUrl: string; width: number; height: number } | null> {
  if (!navigator.mediaDevices?.getDisplayMedia) throw new Error('Este navegador no permite capturar la pantalla')
  let stream: MediaStream
  try {
    const options: DisplayMediaOptions = { video: true, audio: false, preferCurrentTab: true, selfBrowserSurface: 'include' }
    stream = await navigator.mediaDevices.getDisplayMedia(options)
  } catch (err) {
    if (err instanceof DOMException && (err.name === 'NotAllowedError' || err.name === 'AbortError')) return null
    throw err
  }
  try {
    const video = document.createElement('video')
    video.srcObject = stream
    video.muted = true
    await video.play()
    await new Promise<void>((resolve) => {
      if (video.videoWidth) resolve()
      else video.addEventListener('loadedmetadata', () => resolve(), { once: true })
    })
    // A frame or two so the compositor has real pixels, not a black first frame.
    await new Promise((r) => setTimeout(r, 120))
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    canvas.getContext('2d')?.drawImage(video, 0, 0)
    return { dataUrl: canvas.toDataURL('image/png'), width: canvas.width, height: canvas.height }
  } finally {
    stream.getTracks().forEach((t) => t.stop())
  }
}

export interface Region {
  x: number
  y: number
  w: number
  h: number
}

/** Crops (in source pixels) and downsizes to something a vision model handles well. */
export async function cropToImagePart(dataUrl: string, region: Region | null): Promise<ImagePart> {
  const img = new Image()
  img.src = dataUrl
  await img.decode()
  const r = region ?? { x: 0, y: 0, w: img.naturalWidth, h: img.naturalHeight }
  const scale = Math.min(1, MAX_EDGE / Math.max(r.w, r.h))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(r.w * scale))
  canvas.height = Math.max(1, Math.round(r.h * scale))
  canvas.getContext('2d')?.drawImage(img, r.x, r.y, r.w, r.h, 0, 0, canvas.width, canvas.height)
  const out = canvas.toDataURL('image/png')
  return { type: 'image', mediaType: 'image/png', data: out.slice(out.indexOf(',') + 1) }
}
