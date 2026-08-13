'use client'

import { useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { t } from '@/lib/i18n'
import { useStudio } from '@/lib/store/studio'

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  // Экран ошибки живёт внутри приложения, поэтому язык берётся из того же стора, что и весь интерфейс.
  const locale = useStudio((s) => s.locale)

  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-xl font-semibold">{t(locale, 'error.title')}</h1>
      <p className="text-sm text-ink-muted">{t(locale, 'error.body')}</p>
      <Button onClick={() => reset()}>{t(locale, 'error.retry')}</Button>
    </main>
  )
}
