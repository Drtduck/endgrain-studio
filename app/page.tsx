import { CheckoutBanner } from '@/components/CheckoutBanner'
import { StudioShell } from '@/components/StudioShell'
import { getLandingLocale } from '@/lib/landing/locale'

export default async function Page(props: PageProps<'/'>) {
  // Stripe возвращает человека на /?checkout=success или /pricing?checkout=cancel.
  const { checkout } = await props.searchParams
  const state = checkout === 'success' ? 'success' : checkout === 'cancel' ? 'cancel' : null
  const locale = await getLandingLocale()
  return (
    <>
      {state === null ? null : <CheckoutBanner state={state} locale={locale} />}
      <StudioShell />
    </>
  )
}
