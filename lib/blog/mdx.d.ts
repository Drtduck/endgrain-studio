/**
 * @types/mdx типизирует у `*.mdx` только default-экспорт (компонент), остальные
 * экспорты объявлены как «нужно доопределить самим» (см. node_modules/@types/mdx/index.d.ts).
 * Статьи объявляют метаданные как `export const meta`, и это расширение делает
 * импорт `meta` из .mdx типобезопасным во всём проекте. Этот файл - script,
 * а не модуль (top-level import/export здесь запрещён): импорт живёт внутри
 * declare module, как показано в примере @types/mdx/index.d.ts.
 */
declare module '*.mdx' {
  import type { PostMeta } from '@/lib/blog/types'

  export const meta: PostMeta
}
