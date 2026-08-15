// Импорт роняет сборку, если модуль случайно затянут в клиентский бандл:
// отсюда виден service-ключ Supabase.
import 'server-only'
import { getSupabaseService, isSupabaseServiceConfigured } from '@/lib/supabase/service'

export interface CreditsState {
  readonly balance: number
}

export interface CreditTransactionRow {
  readonly id: string
  readonly kind: 'purchase' | 'grant' | 'spend' | 'refund'
  /**
   * В кадрах, со знаком, но только про КУПЛЕННЫЕ кадры: списание, полностью
   * покрытое бесплатной месячной квотой Pro, хранится нулём по дизайну БД
   * (см. комментарий у столбца в 20260815100000_ai_credits.sql - строка нужна
   * для идемпотентности, даже если из платного баланса ничего не ушло). Для
   * честной истории «сколько кадров вообще нарисовано» это не то поле - см.
   * freeUnits/creditUnits и components/credits/CreditsHistory.tsx.
   */
  readonly amount: number
  readonly balanceAfter: number
  readonly feature: string | null
  readonly createdAt: string
  /** Сколько из этого списания покрыто бесплатной месячной квотой Pro (kind='spend'). */
  readonly freeUnits: number
  /** Сколько из этого списания покрыто купленными кадрами (kind='spend'). */
  readonly creditUnits: number
}

/**
 * Баланс читается service-ключом, а не через RLS: вебхук и списание генераций
 * бегут под service-role, значит и чтение для интерфейса лучше держать в одном
 * клиенте, без второго похода через getSupabaseServer. По образцу lib/wallet/server.ts.
 */
export async function readCredits(userId: string): Promise<CreditsState> {
  if (!isSupabaseServiceConfigured()) return { balance: 0 }
  const sb = getSupabaseService()
  const { data, error } = await sb.from('ai_credits').select('balance').eq('user_id', userId).maybeSingle()
  if (error || !data) return { balance: 0 }
  return { balance: Number(data.balance ?? 0) }
}

const TRANSACTIONS_LIMIT = 20

export async function readCreditTransactions(userId: string): Promise<readonly CreditTransactionRow[]> {
  if (!isSupabaseServiceConfigured()) return []
  const sb = getSupabaseService()
  const { data, error } = await sb
    .from('ai_credit_transactions')
    .select('id, kind, amount, balance_after, feature, created_at, free_units, credit_units')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(TRANSACTIONS_LIMIT)
  if (error || !data) return []
  return data.map((row) => ({
    id: String(row.id),
    kind: row.kind as CreditTransactionRow['kind'],
    amount: Number(row.amount),
    balanceAfter: Number(row.balance_after),
    feature: row.feature === null || row.feature === undefined ? null : String(row.feature),
    createdAt: String(row.created_at),
    freeUnits: Number(row.free_units ?? 0),
    creditUnits: Number(row.credit_units ?? 0),
  }))
}
