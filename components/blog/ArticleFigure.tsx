import Image from 'next/image'

/**
 * Единая рамка для иллюстративного фото внутри статьи: скруглённый бордер,
 * лёгкая тень, подпись и обязательная атрибуция фотографа (условие лицензии
 * Pexels - имя автора и ссылка на исходник). Соотношение сторон фиксировано
 * (16:10), потому что кандидаты с Pexels приходят разных пропорций, а колонка
 * статьи должна оставаться ровной независимо от исходного кадра.
 */
export interface ArticleFigureProps {
  readonly src: string
  readonly alt: string
  /** Короткая подпись под фото на языке статьи. */
  readonly caption: string
  readonly photographer: string
  readonly photographerUrl: string
  /** Ссылка на страницу фото на Pexels: атрибуция ведёт на источник, а не только на профиль. */
  readonly pexelsUrl: string
}

export function ArticleFigure({ src, alt, caption, photographer, photographerUrl, pexelsUrl }: ArticleFigureProps) {
  return (
    <figure className="mt-6 overflow-hidden rounded-lg border border-line-subtle bg-surface shadow-sm">
      <div className="relative aspect-[16/10] w-full">
        <Image src={src} alt={alt} fill sizes="(min-width: 768px) 700px, 100vw" className="object-cover" />
      </div>
      <figcaption className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-t border-line-subtle bg-surface-panel px-4 py-2.5 font-sans text-xs text-ink-muted">
        <span>{caption}</span>
        <span>
          {'Photo: '}
          <a
            href={photographerUrl}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="text-accent underline underline-offset-2 hover:text-accent-hover"
          >
            {photographer}
          </a>
          {' / '}
          <a
            href={pexelsUrl}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="text-accent underline underline-offset-2 hover:text-accent-hover"
          >
            Pexels
          </a>
        </span>
      </figcaption>
    </figure>
  )
}
