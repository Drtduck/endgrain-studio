import { NextResponse } from 'next/server'
import { isFalConfigured, isGeminiConfigured, isOpenRouterConfigured, isPrintfulConfigured } from '@/lib/promo/config'
import { isSupabaseConfigured } from '@/lib/supabase/config'

/**
 * Диагностика конфигурации рантайма: только булевы флаги, никаких значений.
 * Появился из-за истории с OPENROUTER_API_KEY, который трижды доезжал до
 * Vercel пустым: проверить, что лямбда реально видит переменную, иначе можно
 * только косвенно по отсутствию строк в логах.
 */
export function GET(): NextResponse {
  return NextResponse.json({
    ok: true,
    providers: {
      supabase: isSupabaseConfigured(),
      gemini: isGeminiConfigured(),
      openrouter: isOpenRouterConfigured(),
      fal: isFalConfigured(),
      printful: isPrintfulConfigured(),
      stripe: (process.env['STRIPE_SECRET_KEY'] ?? '').length > 0,
    },
  })
}
