import { NextResponse, type NextRequest } from 'next/server'
import { safeNextPath } from '@/lib/auth/access'
import { isSupabaseConfigured } from '@/lib/supabase/config'
import { getSupabaseServer } from '@/lib/supabase/server'

export async function GET(request: NextRequest): Promise<NextResponse> {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const oauthError = url.searchParams.get('error') ?? url.searchParams.get('error_description')
  const nextParam = url.searchParams.get('next')
  // Открытый редирект недопустим: принимаем только собственные пути. Самодельная
  // проверка на startsWith('//') пропускала backslash-вариант «/\evil.com» (WHATWG
  // URL резолвит \ как / -> открытый редирект на чужой origin), поэтому используем
  // закалённый общий санитайзер.
  const next = safeNextPath(nextParam)

  // Провайдер (Google) сам может вернуться с ?error= вместо ?code=, например
  // если пользователь отменил вход на экране согласия.
  if (oauthError) {
    return NextResponse.redirect(new URL('/login?error=oauth', request.url))
  }

  if (!isSupabaseConfigured() || !code) {
    return NextResponse.redirect(new URL('/login?error=auth', request.url))
  }

  const sb = await getSupabaseServer()
  const { error } = await sb.auth.exchangeCodeForSession(code)
  if (error) return NextResponse.redirect(new URL('/login?error=auth', request.url))

  return NextResponse.redirect(new URL(next, request.url))
}
