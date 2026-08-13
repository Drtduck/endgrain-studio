// Импорт роняет сборку, если модуль случайно затянут в клиентский бандл:
// отсюда виден service-ключ Supabase.
import 'server-only'
import { getSupabaseService, isSupabaseServiceConfigured } from '@/lib/supabase/service'

export interface WalletState {
  readonly balanceCents: number
}

export interface WalletTransactionRow {
  readonly id: string
  readonly kind: 'topup' | 'spend' | 'refund'
  readonly amountCents: number
  readonly balanceAfter: number
  readonly createdAt: string
}

/**
 * Баланс читается service-ключом, а не через RLS: и вебхук, и списание видео
 * бегут под service-role, значит и чтение для интерфейса лучше держать в одном
 * клиенте, без второго похода через getSupabaseServer.
 */
export async function readWallet(userId: string): Promise<WalletState> {
  if (!isSupabaseServiceConfigured()) return { balanceCents: 0 }
  const sb = getSupabaseService()
  const { data, error } = await sb.from('wallets').select('balance_cents').eq('user_id', userId).maybeSingle()
  if (error || !data) return { balanceCents: 0 }
  return { balanceCents: Number(data.balance_cents ?? 0) }
}

const TRANSACTIONS_LIMIT = 20

export async function readWalletTransactions(userId: string): Promise<readonly WalletTransactionRow[]> {
  if (!isSupabaseServiceConfigured()) return []
  const sb = getSupabaseService()
  const { data, error } = await sb
    .from('wallet_transactions')
    .select('id, kind, amount_cents, balance_after, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(TRANSACTIONS_LIMIT)
  if (error || !data) return []
  return data.map((row) => ({
    id: String(row.id),
    kind: row.kind as WalletTransactionRow['kind'],
    amountCents: Number(row.amount_cents),
    balanceAfter: Number(row.balance_after),
    createdAt: String(row.created_at),
  }))
}
