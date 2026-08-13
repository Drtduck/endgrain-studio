import type { Metadata } from 'next'
import { LegalDocView } from '@/components/legal/LegalDocView'
import { getLandingLocale } from '@/lib/landing/locale'
import { LEGAL_DOCS } from '@/lib/legal'

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLandingLocale()
  return { title: LEGAL_DOCS['personal-data'][locale].title }
}

export default async function PersonalDataPage() {
  const locale = await getLandingLocale()
  return <LegalDocView doc={LEGAL_DOCS['personal-data'][locale]} locale={locale} />
}
