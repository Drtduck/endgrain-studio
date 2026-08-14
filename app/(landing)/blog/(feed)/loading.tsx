import { RouteSkeleton } from '@/components/RouteSkeleton'

/**
 * Скелетон только для ленты блога. Лента вынесена в группу (feed) ровно затем,
 * чтобы этот loading.tsx не накрыл /blog/[slug] и /blog/tag/[tag]: у статьи по
 * несуществующему адресу оболочка утекала бы в ответ раньше 404 и превращала его в 200.
 */
export default function Loading() {
  return <RouteSkeleton rows={2} />
}
