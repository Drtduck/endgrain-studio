/**
 * Заглушка тяжёлых маршрутов (loading.tsx для /gallery, /account, /pricing, /blog).
 *
 * Наличие loading.tsx важнее его красоты: Next предзагружает эту заглушку и
 * коммитит навигацию сразу, не дожидаясь ответа сервера, поэтому клик по пункту
 * меню перестаёт выглядеть зависанием. Текста тут нет намеренно: файл серверный,
 * локаль сюда тащить незачем, а формы читаются и без подписи.
 */
export function RouteSkeleton({ rows = 3 }: { readonly rows?: number }) {
  return (
    <div data-testid="route-skeleton" role="status" aria-busy="true" className="mx-auto w-full max-w-5xl px-4 py-10">
      <div className="h-7 w-52 animate-pulse rounded-md bg-surface-sunken" />
      <div className="mt-3 h-4 w-80 max-w-full animate-pulse rounded-md bg-surface-sunken" />

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: rows * 3 }, (_, i) => (
          <div key={i} className="h-40 animate-pulse rounded-lg border border-line-subtle bg-surface-sunken" />
        ))}
      </div>
    </div>
  )
}
