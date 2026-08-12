import { CheckoutBanner } from '@/components/CheckoutBanner'
import { StudioShell } from '@/components/StudioShell'
import { getLandingLocale } from '@/lib/landing/locale'

/**
 * Потолок времени для серверных действий этой страницы. Серия промо-кадров зовёт
 * Gemini четырьмя параллельными запросами с таймаутом 30 секунд каждый, и в дефолтные
 * 15 секунд Vercel это не укладывается. Стоит здесь, а не рядом с самим действием:
 * из файла с 'use server' Next разрешает экспортировать только асинхронные функции.
 */
export const maxDuration = 60

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
