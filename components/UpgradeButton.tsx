'use client'

import Link from 'next/link'
import { Sparkles } from 'lucide-react'
import { usePro } from '@/components/ProProvider'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { t } from '@/lib/i18n'
import { useStudio } from '@/lib/store/studio'

export function UpgradeButton() {
  const locale = useStudio((s) => s.locale)
  const { status, billingEnabled } = usePro()

  // Без кассы кнопка вела бы в тупик, ровно как AccountButton без Supabase.
  if (!billingEnabled) return null

  if (status.pro) {
    return (
      <Badge variant="outline" data-testid="pro-badge" render={<Link href="/pricing" />}>
        {t(locale, 'pricing.pro.name')}
      </Badge>
    )
  }

  return (
    <Button variant="outline" size="sm" data-testid="upgrade-button" render={<Link href="/pricing" />}>
      <Sparkles data-icon="inline-start" />
      {t(locale, 'pricing.upgrade')}
    </Button>
  )
}
