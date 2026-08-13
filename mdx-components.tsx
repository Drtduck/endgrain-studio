import type { MDXComponents } from 'mdx/types'
import Image, { type ImageProps } from 'next/image'
import Link from 'next/link'
import type { AnchorHTMLAttributes, HTMLAttributes, TableHTMLAttributes } from 'react'

/**
 * Next 16 требует этот файл в корне проекта для @next/mdx в App Router:
 * useMDXComponents() не принимает аргументов (в отличие от Next 15, где
 * функция получала пришедшие компоненты и должна была их смёржить).
 *
 * @tailwindcss/typography не подключаем: его палитра спорила бы с токенами
 * проекта (bg-canvas, text-ink...). Вместо этого явный маппинг тегов на
 * классы дизайн-системы.
 */
function AnchoredHeading({
  Tag,
  className,
  children,
  id,
}: {
  Tag: 'h2' | 'h3'
  className: string
  children: React.ReactNode
  id?: string | undefined
}) {
  // rehype-slug уже проставил id заголовкам; якорь-ссылку рисуем сами, потому что
  // rehype-autolink-headings настраивается функцией, а Turbopack принимает только
  // сериализуемые опции плагинов.
  return (
    <Tag id={id} className={`${className} group scroll-mt-24`}>
      {id ? (
        <a href={`#${id}`} className="no-underline hover:underline">
          {children}
        </a>
      ) : (
        children
      )}
    </Tag>
  )
}

const components: MDXComponents = {
  h2: ({ id, children }: HTMLAttributes<HTMLHeadingElement>) => (
    <AnchoredHeading Tag="h2" className="mt-10 font-display text-2xl font-semibold tracking-tight text-ink" id={id}>
      {children}
    </AnchoredHeading>
  ),
  h3: ({ id, children }: HTMLAttributes<HTMLHeadingElement>) => (
    <AnchoredHeading Tag="h3" className="mt-8 font-display text-xl font-semibold tracking-tight text-ink" id={id}>
      {children}
    </AnchoredHeading>
  ),
  p: (props: HTMLAttributes<HTMLParagraphElement>) => (
    <p className="mt-4 font-sans text-base leading-relaxed text-ink" {...props} />
  ),
  ul: (props: HTMLAttributes<HTMLUListElement>) => (
    <ul className="mt-4 list-disc space-y-1.5 pl-6 font-sans text-base text-ink" {...props} />
  ),
  ol: (props: HTMLAttributes<HTMLOListElement>) => (
    <ol className="mt-4 list-decimal space-y-1.5 pl-6 font-sans text-base text-ink" {...props} />
  ),
  li: (props: HTMLAttributes<HTMLLIElement>) => <li className="pl-1" {...props} />,
  a: ({ href, children, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement>) => {
    const isInternal = typeof href === 'string' && href.startsWith('/')
    if (isInternal && href) {
      return (
        <Link href={href} className="text-accent underline underline-offset-2 hover:text-accent-hover">
          {children}
        </Link>
      )
    }
    return (
      <a
        href={href}
        className="text-accent underline underline-offset-2 hover:text-accent-hover"
        target="_blank"
        rel="noopener noreferrer"
        {...rest}
      >
        {children}
      </a>
    )
  },
  blockquote: (props: HTMLAttributes<HTMLQuoteElement>) => (
    <blockquote
      className="mt-4 border-l-2 border-accent-border bg-accent-soft px-4 py-3 font-sans text-base text-ink"
      {...props}
    />
  ),
  code: (props: HTMLAttributes<HTMLElement>) => (
    <code className="rounded bg-surface-panel px-1.5 py-0.5 font-mono text-[0.9em] text-ink" {...props} />
  ),
  pre: (props: HTMLAttributes<HTMLPreElement>) => (
    <pre className="mt-4 overflow-x-auto rounded-md bg-surface-panel p-4 font-mono text-sm text-ink" {...props} />
  ),
  table: (props: TableHTMLAttributes<HTMLTableElement>) => (
    <div className="mt-4 overflow-x-auto">
      <table className="w-full border-collapse font-sans text-sm text-ink" {...props} />
    </div>
  ),
  th: (props: HTMLAttributes<HTMLTableCellElement>) => (
    <th className="border border-line bg-surface-panel px-3 py-2 text-left font-semibold" {...props} />
  ),
  td: (props: HTMLAttributes<HTMLTableCellElement>) => (
    <td className="border border-line px-3 py-2" {...props} />
  ),
  img: ({ alt, ...props }) => (
    <Image
      {...(props as ImageProps)}
      sizes="100vw"
      style={{ width: '100%', height: 'auto' }}
      className="mt-4 rounded-md"
      alt={alt ?? ''}
    />
  ),
  hr: (props: HTMLAttributes<HTMLHRElement>) => <hr className="mt-8 border-line" {...props} />,
}

export function useMDXComponents(): MDXComponents {
  return components
}
