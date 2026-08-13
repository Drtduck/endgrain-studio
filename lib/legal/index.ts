import { pdConsentDoc } from './pdConsent'
import { personalDataDoc } from './personalData'
import { privacyDoc } from './privacy'
import type { LegalDocByLocale, LegalSlug } from './types'

export type { LegalDoc, LegalDocByLocale, LegalSection, LegalSlug } from './types'

export const LEGAL_DOCS: Readonly<Record<LegalSlug, LegalDocByLocale>> = {
  privacy: privacyDoc,
  'personal-data': personalDataDoc,
  consent: pdConsentDoc,
}
