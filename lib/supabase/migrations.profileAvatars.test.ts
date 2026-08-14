import { describe, expect, it } from 'vitest'
import { readMigration } from './migrationSql'

describe('20260814170000_profile_avatars.sql: колонка аватара и bucket avatars', () => {
  const sql = readMigration('20260814170000_profile_avatars.sql')

  it('колонка добавляется идемпотентно и ограничена по длине', () => {
    expect(sql).toMatch(/alter table public\.profiles\s*\n\s*add column if not exists avatar_url text;/)
    expect(sql).toMatch(/add constraint profiles_avatar_url_len\s*\n\s*check \(avatar_url is null or char_length\(avatar_url\) <= 512\)/)
  })

  it('схема ссылки ограничена https или относительным путём: javascript:/data: в колонку не лягут', () => {
    expect(sql).toMatch(/add constraint profiles_avatar_url_scheme\s*\n\s*check \(avatar_url is null or avatar_url ~ '\^\(https:\/\/\|\/\)'\)/)
  })

  it('avatar_url попадает в select-гранты anon и authenticated, notify_email по-прежнему нет', () => {
    const anonRevoke = sql.indexOf('revoke select on public.profiles from anon;')
    const anonGrant = sql.indexOf('grant select (user_id, display_name, bio, website, avatar_url, created_at) on public.profiles to anon;')
    expect(anonRevoke).toBeGreaterThan(-1)
    expect(anonGrant).toBeGreaterThan(-1)
    expect(anonRevoke).toBeLessThan(anonGrant)

    const authRevoke = sql.indexOf('revoke select on public.profiles from authenticated;')
    const authGrant = sql.indexOf(
      'grant select (user_id, display_name, bio, website, avatar_url, created_at, updated_at) on public.profiles to authenticated;',
    )
    expect(authRevoke).toBeGreaterThan(-1)
    expect(authGrant).toBeGreaterThan(-1)
    expect(authRevoke).toBeLessThan(authGrant)

    expect(sql.slice(anonGrant, anonGrant + 140)).not.toContain('notify_email')
    expect(sql.slice(authGrant, authGrant + 150)).not.toContain('notify_email')
  })

  it('avatar_url есть в update и insert грантах authenticated', () => {
    expect(sql).toContain('grant update (user_id, display_name, bio, website, avatar_url, notify_email) on public.profiles to authenticated;')
    expect(sql).toContain('grant insert (user_id, display_name, bio, website, avatar_url, notify_email) on public.profiles to authenticated;')
  })

  it('bucket avatars публичный, с пределом размера и белым списком типов без SVG', () => {
    expect(sql).toMatch(/insert into storage\.buckets \(id, name, public, file_size_limit, allowed_mime_types\)/)
    expect(sql).toMatch(/'avatars',\s*\n\s*'avatars',\s*\n\s*true,/)
    expect(sql).toContain('1048576')
    expect(sql).toMatch(/array\['image\/png', 'image\/jpeg', 'image\/webp'\]/)
    expect(sql).not.toContain('image/svg')
    // Повторный прогон миграции не должен падать на существующем bucket.
    expect(sql).toMatch(/on conflict \(id\) do update/)
  })

  it('чтение bucket открыто всем, запись и удаление - только своей папке владельца', () => {
    expect(sql).toMatch(/create policy avatars_public_read\s*\n\s*on storage\.objects for select\s*\n\s*to public\s*\n\s*using \(bucket_id = 'avatars'\)/)

    const ownFolder = "\\(storage\\.foldername\\(name\\)\\)\\[1\\] = \\(select auth\\.uid\\(\\)\\)::text"
    expect(sql).toMatch(
      new RegExp(`create policy avatars_insert_own\\s*\\n\\s*on storage\\.objects for insert\\s*\\n\\s*to authenticated\\s*\\n\\s*with check \\(bucket_id = 'avatars' and ${ownFolder}\\)`),
    )
    expect(sql).toMatch(new RegExp(`create policy avatars_update_own[\\s\\S]*?using \\(bucket_id = 'avatars' and ${ownFolder}\\)[\\s\\S]*?with check \\(bucket_id = 'avatars' and ${ownFolder}\\)`))
    expect(sql).toMatch(new RegExp(`create policy avatars_delete_own\\s*\\n\\s*on storage\\.objects for delete\\s*\\n\\s*to authenticated\\s*\\n\\s*using \\(bucket_id = 'avatars' and ${ownFolder}\\)`))
  })

  it('каждая политика переобъявляется идемпотентно через drop policy if exists', () => {
    for (const name of ['avatars_public_read', 'avatars_insert_own', 'avatars_update_own', 'avatars_delete_own']) {
      expect(sql).toContain(`drop policy if exists ${name} on storage.objects;`)
    }
  })
})
