'use client'

import { X } from 'lucide-react'
import { AuthCta } from '@/components/landing/AuthCta'
import { Dialog, DialogClose, DialogContent, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { t, type Locale } from '@/lib/i18n'

export interface LightboxShot {
  readonly slug: string
  readonly src: string
  readonly label: string
}

/**
 * Свой Dialog на каждый снимок, а не один общий с индексом: их пять, зато связка
 * триггер-попап и возврат фокуса на нужную кнопку достаются от Base UI даром.
 */
export function ShotLightbox({ locale, shots }: { locale: Locale; shots: readonly LightboxShot[] }) {
  return (
    <div className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2">
      {shots.map((shot) => (
        <Dialog key={shot.slug}>
          <DialogTrigger
            data-testid={`landing-shot-trigger-${shot.slug}`}
            aria-label={t(locale, 'landing.shots.open', { name: shot.label })}
            className="shrink-0 snap-start rounded-lg"
          >
            <img
              src={shot.src}
              width={1280}
              height={720}
              loading="lazy"
              alt={shot.label}
              data-testid={`landing-shot-${shot.slug}`}
              className="eg-tilt h-auto w-[85vw] rounded-lg border border-line bg-surface-raised sm:w-[420px]"
            />
          </DialogTrigger>

          <DialogContent data-testid="landing-shot-dialog" backdropTestId="landing-shot-dialog-backdrop">
            <DialogTitle>{shot.label}</DialogTitle>
            <DialogClose data-testid="landing-shot-dialog-close" aria-label={t(locale, 'landing.shots.close')}>
              <X className="size-4" aria-hidden="true" />
            </DialogClose>
            <img
              src={shot.src}
              width={1280}
              height={720}
              alt={shot.label}
              data-testid="landing-shot-dialog-image"
              className="h-auto w-full rounded-md border border-line bg-surface-raised"
            />

            {/* Кнопка под картинкой и по центру: не перекрывает ни снимок, ни крестик закрытия. */}
            <div className="flex justify-center">
              <AuthCta
                locale={locale}
                testId={`landing-shot-dialog-cta-${shot.slug}`}
                label={t(locale, 'landing.hero.ctaPrimary')}
                className="inline-flex rounded-md bg-accent px-5 py-3 font-sans text-base font-semibold text-accent-fg shadow-sm transition-colors duration-hover hover:bg-accent-hover"
              />
            </div>
          </DialogContent>
        </Dialog>
      ))}
    </div>
  )
}
