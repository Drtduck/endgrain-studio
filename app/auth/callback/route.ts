import { NextResponse, type NextRequest } from 'next/server'
import { isSupabaseConfigured } from '@/lib/supabase/config'
import { getSupabaseServer } from '@/lib/supabase/server'

export async function GET(request: NextRequest): Promise<NextResponse> {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const nextParam = url.searchParams.get('next')
  // Открытый редирект недопустим: принимаем только собственные пути.
  const next = nextParam && nextParam.startsWith('/') && !nextParam.startsWith('//') ? nextParam : '/'

  if (!isSupabaseConfigured() || !code) {
    return NextResponse.redirect(new URL('/login?error=auth', request.url))
  }

  const sb = await getSupabaseServer()
  const { error } = await sb.auth.exchangeCodeForSession(code)
  if (error) return NextResponse.redirect(new URL('/login?error=auth', request.url))

  return NextResponse.redirect(new URL(next, request.url))
}
