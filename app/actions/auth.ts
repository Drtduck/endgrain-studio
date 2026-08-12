'use server'

import { redirect } from 'next/navigation'
import { isSupabaseConfigured } from '@/lib/supabase/config'
import { getSupabaseServer } from '@/lib/supabase/server'

export async function signOutAction(): Promise<void> {
  if (isSupabaseConfigured()) {
    const sb = await getSupabaseServer()
    await sb.auth.signOut()
  }
  // redirect бросает специальное исключение: любой код после него мёртв.
  redirect('/')
}
