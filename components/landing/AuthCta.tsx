'use client'

import { X } from 'lucide-react'
import { useRef, useState, type MouseEvent } from 'react'
import { AuthForm } from '@/components/auth/AuthForm'
import { Button } from '@/components/ui/button'
import { Dialog, DialogClose, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { t, type Locale } from '@/lib/i18n'
import { APP_SIGNUP_URL, appOriginForClient } from '@/lib/routing/host'
import { hardNavigate } from '@/lib/routing/navigate'

/**
 * Кнопка призыва к действию, открывающая вход прямо на лендинге. Триггер это настоящая
 * ссылка на /register, а не button: без JS и при провале гидратации человек всё равно
 * попадает на страницу регистрации, то есть запасной вход держится разметкой, а не обещанием.
 * Диалог поэтому контролируемый, без DialogTrigger, и возврат фокуса задаётся finalFocus.
 */
export function AuthCta({
  locale,
  testId,
  label,
  className,
}: {
  locale: Locale
  testId: string
  label: string
  className?: string
}) {
  const anchorRef = useRef<HTMLAnchorElement>(null)
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<'login' | 'register'>('register')
  const [confirmSent, setConfirmSent] = useState(false)

  function onTriggerClick(event: MouseEvent<HTMLAnchorElement>): void {
    // Модификаторы и не левая кнопка это осознанное «открой в новой вкладке»:
    // такой клик отдаём браузеру вместе со ссылкой на страницу регистрации.
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return
    event.preventDefault()
    setConfirmSent(false)
    setMode('register')
    setOpen(true)
  }

  const appOrigin = typeof window === 'undefined' ? '' : appOriginForClient()

  return (
    <>
      <a
        ref={anchorRef}
        href={APP_SIGNUP_URL}
        data-testid={testId}
        className={className}
        onClick={onTriggerClick}
      >
        {label}
      </a>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          data-testid="landing-auth-dialog"
          backdropTestId="landing-auth-dialog-backdrop"
          finalFocus={anchorRef}
          className="w-[min(420px,92vw)] gap-4"
        >
          <DialogTitle>{t(locale, mode === 'login' ? 'auth.loginTitle' : 'auth.registerTitle')}</DialogTitle>
          <DialogClose data-testid="landing-auth-dialog-close" aria-label={t(locale, 'auth.dialogClose')}>
            <X className="size-4" aria-hidden="true" />
          </DialogClose>

          <p className="text-sm leading-normal text-ink-secondary">
            {t(locale, mode === 'login' ? 'auth.loginSubtitle' : 'auth.registerSubtitle')}
          </p>

          {mode === 'register' && !confirmSent ? (
            <p data-testid="landing-auth-why" className="text-sm leading-normal text-ink-secondary">
              {t(locale, 'auth.registerWhy')}
            </p>
          ) : null}

          {/* key сбрасывает введённые поля и ошибку при переключении режима. */}
          <AuthForm
            key={mode}
            mode={mode}
            locale={locale}
            redirectOrigin={appOrigin}
            onConfirmSent={() => setConfirmSent(true)}
            // Другой origin: роутер Next туда не ходит, поэтому меняем адрес целиком.
            onSuccess={(next) => hardNavigate(new URL(next, appOriginForClient()).toString())}
          />

          {confirmSent ? (
            <DialogClose
              data-testid="landing-auth-confirm-close"
              className="static inline-flex h-9 w-full items-center justify-center rounded-md border border-line bg-surface px-3 text-sm font-medium text-ink"
            >
              {t(locale, 'auth.confirmClose')}
            </DialogClose>
          ) : (
            <div className="flex flex-col gap-2 text-sm text-ink-secondary">
              <Button
                type="button"
                variant="ghost"
                data-testid="landing-auth-switch"
                // Доступное имя это видимый текст кнопки: aria-label поверх него нарушал бы
                // WCAG 2.5.3 (голосовое управление ищет кнопку по тому, что написано).
                className="justify-start px-0 text-accent hover:underline"
                onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
              >
                {t(locale, mode === 'login' ? 'auth.registerLink' : 'auth.loginLink')}
              </Button>

              <a
                href={`${appOrigin}/forgot-password`}
                data-testid="landing-auth-forgot"
                className="text-accent hover:underline"
              >
                {t(locale, 'auth.forgotLink')}
              </a>

              <a
                href={`${appOrigin}/login`}
                data-testid="landing-auth-fallback"
                className="text-xs text-ink-muted hover:underline"
              >
                {t(locale, 'auth.dialogFallback')}
              </a>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
