'use client'

import './globals.css'

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="ru">
      <body className="min-h-full flex flex-col antialiased">
        <main className="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center gap-4 p-6 text-center">
          <h1 className="text-xl font-semibold">Критическая ошибка приложения</h1>
          <p className="text-sm text-muted-foreground">
            Студия не смогла загрузиться. Обновите страницу.
            <br />
            <span className="text-xs">The app failed to load. Please refresh the page.</span>
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
