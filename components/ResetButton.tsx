'use client'

import { useState } from 'react'
import { RotateCcw } from 'lucide-react'
import { ConfirmReplace } from '@/components/ConfirmReplace'
import { Button } from '@/components/ui/button'
import { t } from '@/lib/i18n'
import { useStudio } from '@/lib/store/studio'

/**
 * Явная кнопка сброса рядом с undo/redo: единственный способ полностью стереть текущий проект
 * (документ, историю, выбор, автосохранение) и вернуться к образцу по умолчанию. Всегда с
 * подтверждением - молча стирать реальную работу нельзя, даже если человек просто промахнулся.
 */
export function ResetButton() {
  const locale = useStudio((s) => s.locale)
  const resetStudio = useStudio((s) => s.resetStudio)
  const [confirming, setConfirming] = useState(false)

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        className="gap-1.5"
        data-testid="reset-studio"
        onClick={() => setConfirming(true)}
      >
        <RotateCcw size={15} strokeWidth={1.6} />
        {t(locale, 'reset.button')}
      </Button>

      {confirming ? (
        <ConfirmReplace
          testId="reset"
          title={t(locale, 'reset.confirmTitle')}
          body={t(locale, 'reset.confirmBody')}
          confirmLabel={t(locale, 'reset.confirmApply')}
          cancelLabel={t(locale, 'reset.confirmCancel')}
          onConfirm={() => {
            resetStudio()
            setConfirming(false)
          }}
          onCancel={() => setConfirming(false)}
        />
      ) : null}
    </>
  )
}
