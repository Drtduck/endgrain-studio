'use client'

import './globals.css'

/**
 * Рендерится вместо всего документа, layout и стор приложения сюда не доходят,
 * поэтому языка взять неоткуда: текст честно двуязычный целиком, включая кнопку.
 */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="ru">
      <body className="min-h-full flex flex-col antialiased">
        <main className="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center gap-4 p-6 text-center">
          <h1 className="text-xl font-semibold">Приложение упало</h1>
          <h2 className="text-xl font-semibold">The app crashed</h2>
          <p className="text-sm text-ink-muted">
            Приложение не загрузилось. Обновите страницу.
            <br />
            The app did not load. Reload the page.
          </p>
          <button
            type="button"
            onClick={() => reset()}
            className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-app"
          >
            Повторить / Retry
          </button>
        </main>
      </body>
    </html>
  )
}
