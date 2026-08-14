import type { ReactNode } from 'react'
import { AppShell } from '@/components/AppShell'
import { getLandingLocale } from '@/lib/landing/locale'

export default async function GalleryLayout({ children }: { children: ReactNode }) {
  const locale = await getLandingLocale()
  return <AppShell locale={locale}>{children}</AppShell>
}
