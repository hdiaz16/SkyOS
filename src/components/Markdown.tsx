import { createContext, isValidElement, useContext, type ReactNode } from 'react'
import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { cn } from '../lib/utils'
import { Mermaid } from './Mermaid'

/** Whether the <code> being styled sits inside a <pre>: that, not the language- prefix, makes it a block. */
const InPre = createContext(false)

const isMermaidCode = (child: ReactNode): boolean =>
  isValidElement<{ className?: string }>(child) && typeof child.props.className === 'string' && child.props.className.includes('language-mermaid')

/**
 * Markdown for assistant replies and app content (Notion pages, documents). GitHub-flavored: headings,
 * lists with nesting, task lists, tables, quotes, code, links, images. Raw HTML is never rendered, so
 * model or third-party output cannot inject markup.
 */

const components: Components = {
  h1: ({ children }) => <h1 className="mt-6 mb-2 font-display text-[22px] font-bold tracking-tight text-ink first:mt-0">{children}</h1>,
  h2: ({ children }) => <h2 className="mt-5 mb-2 font-display text-[18px] font-bold tracking-tight text-ink first:mt-0">{children}</h2>,
  h3: ({ children }) => <h3 className="mt-4 mb-1.5 text-[15px] font-semibold text-ink first:mt-0">{children}</h3>,
  h4: ({ children }) => <h4 className="mt-3 mb-1 text-[14px] font-semibold text-ink first:mt-0">{children}</h4>,
  p: ({ children }) => <p className="my-1.5 leading-relaxed">{children}</p>,
  ul: ({ children, className }) => <ul className={cn('my-1.5 list-disc space-y-0.5 pl-5', className?.includes('contains-task-list') && 'list-none pl-1')}>{children}</ul>,
  ol: ({ children }) => <ol className="my-1.5 list-decimal space-y-0.5 pl-5">{children}</ol>,
  li: ({ children, className }) => <li className={cn('leading-relaxed', className?.includes('task-list-item') && 'flex items-start gap-2')}>{children}</li>,
  input: ({ checked }) => (
    <span className={cn('mt-[5px] inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border', checked ? 'border-accent bg-accent text-white' : 'border-line-2')} aria-hidden>
      {checked && <span className="text-[9px] leading-none">✓</span>}
    </span>
  ),
  blockquote: ({ children }) => <blockquote className="my-2 rounded-r-lg border-l-2 border-accent/60 bg-surface-2/70 px-3 py-1.5 text-ink-2">{children}</blockquote>,
  hr: () => <hr className="my-4 border-line" />,
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noopener noreferrer" className="text-accent underline decoration-accent/40 underline-offset-2 hover:decoration-accent">
      {children}
    </a>
  ),
  strong: ({ children }) => <strong className="font-semibold text-ink">{children}</strong>,
  em: ({ children }) => <em>{children}</em>,
  del: ({ children }) => <del className="text-ink-3">{children}</del>,
  img: ({ src, alt }) => (typeof src === 'string' ? <img src={src} alt={alt ?? ''} loading="lazy" className="my-2 max-h-[420px] max-w-full rounded-lg border border-line" /> : null),
  pre: ({ children }) => {
    const only = Array.isArray(children) ? children.find((c) => isValidElement(c)) : children
    if (isMermaidCode(only)) return <div className="my-2">{children}</div>
    return (
      <pre className="scrollbar-thin my-2 overflow-x-auto rounded-xl bg-ink/[0.06] p-3 font-mono text-[12px] leading-relaxed text-ink dark:bg-white/[0.06]">
        <InPre.Provider value>{children}</InPre.Provider>
      </pre>
    )
  },
  code: ({ children, className }) => <MarkdownCode className={className}>{children}</MarkdownCode>,
  table: ({ children }) => (
    <div className="scrollbar-thin my-2 overflow-x-auto">
      <table className="min-w-[320px] border-collapse text-[13px]">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-surface-2">{children}</thead>,
  th: ({ children }) => <th className="border border-line px-2.5 py-1.5 text-left font-medium text-ink">{children}</th>,
  td: ({ children }) => <td className="border border-line px-2.5 py-1.5 align-top">{children}</td>,
}

/** A fence with no language —``` plain, the most common in model replies— carries no className, so it used to
 *  fall to the inline style: a boxed 12.5px code inside the <pre>'s own box. Being inside a <pre> decides. */
function MarkdownCode({ children, className }: { children: ReactNode; className?: string }) {
  const inPre = useContext(InPre)
  if (typeof className === 'string' && className.includes('language-mermaid')) return <Mermaid code={String(children)} />
  const block = inPre || (typeof className === 'string' && className.startsWith('language-'))
  return block ? <code className="font-mono">{children}</code> : <code className="rounded bg-surface-2 px-1 py-px font-mono text-[12.5px] text-ink">{children}</code>
}

export function Markdown({ text, className }: { text: string; className?: string }) {
  return (
    <div className={cn('select-text', className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components} skipHtml>
        {text}
      </ReactMarkdown>
    </div>
  )
}

/** For places that want inline-only rendering of a short string (no block wrappers). */
export function InlineMarkdown({ text }: { text: string }): ReactNode {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ ...components, p: ({ children }) => <>{children}</> }} skipHtml>
      {text}
    </ReactMarkdown>
  )
}
