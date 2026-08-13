/**
 * Серверный компонент: рендерит один <script type="application/ld+json">.
 * Функции в lib/seo/jsonld.ts возвращают простые объекты, вся сериализация
 * происходит здесь, в единственном месте.
 */
export function JsonLd({ data }: { data: Record<string, unknown> }) {
  // Экранируем "<": содержимое в итоге приходит из статей, и незакрытый </script>
  // внутри строкового значения иначе оборвал бы тег раньше времени.
  const json = JSON.stringify(data).replace(/</g, '\\u003c')
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />
}
