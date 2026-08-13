import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Общий помощник для тестов-структур по тексту SQL-миграций (см.
 * migrations.wallet.test.ts, migrations.apiKeys.test.ts, migrations.gallery.test.ts).
 * Живой Postgres в vitest не поднять, но порядок операторов внутри security
 * definer функций - это ровно то, что определяет идемпотентность и
 * корректность лимитов, и его можно проверить регулярными выражениями по
 * исходнику. Миграции ещё не применены к удалённой базе (см. CLAUDE.md),
 * поэтому это единственная автоматическая проверка, которая у них сейчас есть.
 */
const MIGRATIONS_DIR = join(__dirname, '..', '..', 'supabase', 'migrations')

export function readMigration(name: string): string {
  return readFileSync(join(MIGRATIONS_DIR, name), 'utf8')
}

/** Тело функции от `create or replace function public.<name>(` до закрывающего `$$;`. */
export function extractFunctionBody(sql: string, name: string): string {
  const start = sql.indexOf(`create or replace function public.${name}(`)
  if (start < 0) throw new Error(`функция ${name} должна существовать в миграции`)
  const end = sql.indexOf('\n$$;', start)
  if (end < 0) throw new Error(`конец тела функции ${name} (маркер $$;) должен найтись`)
  return sql.slice(start, end)
}
