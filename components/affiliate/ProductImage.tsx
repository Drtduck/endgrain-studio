'use client'

import { useState } from 'react'
import { productImageUrl } from '@/lib/affiliate'
import type { AffiliateItem } from '@/lib/affiliate/types'

interface ProductImageProps {
  readonly item: AffiliateItem
  readonly alt: string
  readonly width: number
  readonly height: number
  readonly className?: string
  /** object-fit картинки: contain для товаров разной формы, cover для книжных обложек. */
  readonly fit?: 'contain' | 'cover'
}

const MIN_VALID_SIZE_PX = 8

/**
 * Картинка товара с амазоновского CDN. Часть ASIN отдаёт по стандартному
 * паттерну 1x1 заглушку с кодом 200 (onError не срабатывает), поэтому кроме
 * onError дополнительно проверяем реальный размер загруженной картинки в
 * onLoad. В обоих случаях показываем плейсхолдер с инициалами бренда, чтобы
 * карточка не оставалась с пустым местом.
 */
export function ProductImage({ item, alt, width, height, className, fit = 'contain' }: ProductImageProps) {
  const [failed, setFailed] = useState(false)
  const initials = item.brand.slice(0, 2).toUpperCase()

  if (failed) {
    return (
      <span
        role="img"
        aria-label={alt}
        data-testid="product-image-placeholder"
        style={{ width, height }}
        className={`flex shrink-0 items-center justify-center rounded-md border border-line-subtle bg-surface-sunken font-mono text-[11px] font-semibold text-ink-muted ${className ?? ''}`}
      >
        {initials}
      </span>
    )
  }

  return (
    <img
      src={productImageUrl(item)}
      alt={alt}
      width={width}
      height={height}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
      onLoad={(event) => {
        const img = event.currentTarget
        if (img.naturalWidth < MIN_VALID_SIZE_PX || img.naturalHeight < MIN_VALID_SIZE_PX) {
          setFailed(true)
        }
      }}
      style={{ width, height }}
      className={`shrink-0 rounded-md border border-line-subtle bg-white ${fit === 'cover' ? 'object-cover' : 'object-contain'} ${className ?? ''}`}
    />
  )
}
