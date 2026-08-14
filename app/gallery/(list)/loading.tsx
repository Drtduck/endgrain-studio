import { RouteSkeleton } from '@/components/RouteSkeleton'

/**
 * Скелетон только для ленты галереи. Ради этого лента и лежит в группе (list):
 * будь loading.tsx уровнем выше, он накрыл бы и /gallery/[id], а стриминг оболочки
 * успевал бы отдать 200 раньше, чем notFound() внутри страницы публикации.
 */
export default function Loading() {
  return <RouteSkeleton rows={2} />
}
