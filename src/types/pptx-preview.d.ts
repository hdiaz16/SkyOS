/** pptx-preview ships JavaScript with detached .d.ts files TypeScript cannot find; this is the surface Sky uses. */
declare module 'pptx-preview' {
  export interface PreviewerOptions {
    renderer?: string
    width?: number
    height?: number
    mode?: 'list' | 'slide'
  }
  export interface PPTXPreviewer {
    readonly slideCount: number
    preview(file: ArrayBuffer): Promise<unknown>
    renderNextSlide(): void
    renderPreSlide(): void
    destroy(): void
  }
  export function init(dom: HTMLElement, options: PreviewerOptions): PPTXPreviewer
}
