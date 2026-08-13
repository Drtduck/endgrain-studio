import type { ReactNode } from 'react'
import { LandingFooter } from '@/components/landing/LandingFooter'
import { LandingHeader } from '@/components/landing/LandingHeader'
import { getLandingLocale } from '@/lib/landing/locale'

export default async function BlogLayout({ children }: { children: ReactNode }) {
  const locale = await getLandingLocale()

  return (
    <>
      <LandingHeader locale={locale} />
      {children}
      <LandingFooter locale={locale} />
    </>
  )
}
