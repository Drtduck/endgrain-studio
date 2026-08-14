import { meta as kerfIPripuski } from '@/content/blog/kerf-i-pripuski.mdx'
import { meta as kerfIPripuskiEn } from '@/content/blog/kerf-i-pripuski-en.mdx'
import { meta as vyborPorod } from '@/content/blog/vybor-porod.mdx'
import { meta as vyborPorodEn } from '@/content/blog/vybor-porod-en.mdx'
import { meta as shemaPerekleyki } from '@/content/blog/shema-perekleyki.mdx'
import { meta as shemaPerekleykiEn } from '@/content/blog/shema-perekleyki-en.mdx'
import type { PostMeta } from './types'

/**
 * Явный список статей вместо чтения директории через fs: итерация директории на
 * сервере ломает статическую сборку и не типизируется. Новую статью нужно дописать
 * сюда руками - lib/blog/registry.test.ts падает, если файл в content/blog есть,
 * а тут его нет, так что забыть физически не получится.
 */
export const POST_METAS: readonly PostMeta[] = [
  kerfIPripuski,
  kerfIPripuskiEn,
  vyborPorod,
  vyborPorodEn,
  shemaPerekleyki,
  shemaPerekleykiEn,
]
