'use client'

import { useEffect } from 'react'
import { Button } from '@/components/ui/button'

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-xl font-semibold">Что-то пошло не так</h1>
      <p className="text-sm text-muted-foreground">
        Произошла непредвиденная ошибка при отображении студии. Попробуйте ещё раз.
        <br />
        <span className="text-xs">Something went wrong while rendering the studio. Please try again.</span>
      </p>
      <Button onClick={() => reset()}>Повторить / Retry</Button>
    </main>
  )
}
