'use client'

import Link from 'next/link'
import type { ComponentProps } from 'react'
import { startNavProgress } from '@/lib/store/nav'

/**
 * next/link, который зажигает глобальную полоску прогресса (NavProgress).
 *
 * onNavigate - штатный проп Link: срабатывает синхронно на клике и только для
 * клиентской навигации, то есть не мешает открытию в новой вкладке и внешним
 * адресам. Этого достаточно для мгновенной реакции; useLinkStatus тут не нужен,
 * потому что он живёт только внутри одной ссылки и на предзагруженных
 * маршрутах pending вообще пропускается.
 */
export function NavLink({ onNavigate, ...props }: ComponentProps<typeof Link>) {
  return (
    <Link
      {...props}
      onNavigate={(event) => {
        startNavProgress()
        onNavigate?.(event)
      }}
    />
  )
}
