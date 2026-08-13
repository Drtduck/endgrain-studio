'use client'

import { X } from 'lucide-react'
import { useRef, useState, type MouseEvent } from 'react'
import { AuthForm } from '@/components/auth/AuthForm'
import { AuthHeader } from '@/components/auth/AuthHeader'
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
          <AuthHeader
            locale={locale}
            titleKey={mode === 'login' ? 'auth.loginTitle' : 'auth.registerTitle'}
            subtitleKey={mode === 'login' ? 'auth.loginSubtitle' : undefined}
            title={
              <DialogTitle className="font-display text-xl font-semibold text-ink">
                {t(locale, mode === 'login' ? 'auth.loginTitle' : 'auth.registerTitle')}
              </DialogTitle>
            }
          />
          <DialogClose data-testid="landing-auth-dialog-close" aria-label={t(locale, 'auth.dialogClose')}>
            <X className="size-4" aria-hidden="true" />
          </DialogClose>

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
            <div className="flex flex-col items-center gap-2 text-center text-sm text-ink-secondary">
              <p>
                {t(locale, mode === 'login' ? 'auth.noAccountPrompt' : 'auth.hasAccountPrompt')}{' '}
                <button
                  type="button"
                  data-testid="landing-auth-switch"
                  className="font-semibold text-accent hover:underline"
                  onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
                >
                  {t(locale, mode === 'login' ? 'auth.registerAction' : 'auth.signIn')}
                </button>
              </p>

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
