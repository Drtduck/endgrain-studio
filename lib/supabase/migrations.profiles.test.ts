import { describe, expect, it } from 'vitest'
import { readMigration } from './migrationSql'

describe('20260814100000_profiles.sql: таблица профилей и её грани доступа', () => {
  const sql = readMigration('20260814100000_profiles.sql')

  it('таблица объявлена с ограничениями на длину полей и схему website', () => {
    expect(sql).toMatch(/create table if not exists public\.profiles/)
    expect(sql).toMatch(/constraint profiles_display_name_len check \(display_name is null or char_length\(display_name\) between 2 and 40\)/)
    expect(sql).toMatch(/constraint profiles_bio_len check \(bio is null or char_length\(bio\) <= 280\)/)
    expect(sql).toMatch(/constraint profiles_website_scheme check \(website is null or website ~\* '\^https\?:\/\/'\)/)
  })

  it('user_id ссылается на auth.users с каскадным удалением', () => {
    expect(sql).toMatch(/user_id\s+uuid primary key references auth\.users \(id\) on delete cascade/)
  })

  it('триггер обновления updated_at подключён через общий touch_updated_at', () => {
    expect(sql).toMatch(/create trigger profiles_touch_updated_at\s*\n\s*before update on public\.profiles\s*\n\s*for each row execute function public\.touch_updated_at\(\)/)
  })

  it('RLS включён и select открыт анониму и authenticated без ограничения по строкам', () => {
    expect(sql).toMatch(/alter table public\.profiles enable row level security/)
    expect(sql).toMatch(/create policy profiles_select_all on public\.profiles\s*\n\s*for select to anon, authenticated\s*\n\s*using \(true\)/)
  })

  it('insert и update разрешены только владельцу строки', () => {
    expect(sql).toMatch(/create policy profiles_insert_own on public\.profiles\s*\n\s*for insert to authenticated\s*\n\s*with check \(user_id = \(select auth\.uid\(\)\)\)/)
    expect(sql).toMatch(
      /create policy profiles_update_own on public\.profiles\s*\n\s*for update to authenticated\s*\n\s*using \(user_id = \(select auth\.uid\(\)\)\)\s*\n\s*with check \(user_id = \(select auth\.uid\(\)\)\)/,
    )
  })

  it('политики delete нет: строка живёт и умирает только вместе с auth.users', () => {
    expect(sql).not.toMatch(/for delete/)
  })

  it('anon получает select только по безопасному подмножеству колонок, revoke идёт первым', () => {
    const revokeIdx = sql.indexOf('revoke select on public.profiles from anon;')
    const grantIdx = sql.indexOf('grant select (user_id, display_name, bio, website, created_at) on public.profiles to anon;')
    expect(revokeIdx, 'revoke select от anon должен присутствовать').toBeGreaterThan(-1)
    expect(grantIdx, 'узкий grant select для anon должен присутствовать').toBeGreaterThan(-1)
    expect(revokeIdx).toBeLessThan(grantIdx)
    // notify_email - приватная настройка, анониму её видно быть не должно.
    expect(sql.slice(grantIdx, grantIdx + 120)).not.toContain('notify_email')
  })

  it('authenticated может писать update только по display_name/bio/website/notify_email', () => {
    const revokeIdx = sql.indexOf('revoke update on public.profiles from authenticated;')
    const grantIdx = sql.indexOf('grant update (display_name, bio, website, notify_email) on public.profiles to authenticated;')
    expect(revokeIdx, 'revoke update от authenticated должен присутствовать').toBeGreaterThan(-1)
    expect(grantIdx, 'узкий grant update для authenticated должен присутствовать').toBeGreaterThan(-1)
    expect(revokeIdx).toBeLessThan(grantIdx)
    // user_id и created_at обязаны остаться недоступны обычному update из браузера.
    expect(sql.slice(grantIdx, grantIdx + 120)).not.toContain('user_id')
    expect(sql.slice(grantIdx, grantIdx + 120)).not.toContain('created_at')
  })
})
