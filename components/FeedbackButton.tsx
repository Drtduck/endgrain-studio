'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { MessageSquarePlus, Paperclip, X } from 'lucide-react'
import { submitFeedbackAction, type FeedbackResult } from '@/app/actions/feedback'
import { Button, buttonVariants } from '@/components/ui/button'
import { HelpHint } from '@/components/ui/help-hint'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Textarea } from '@/components/ui/textarea'
import { FEEDBACK_ATTACHMENT_MAX_BYTES, FEEDBACK_MAX_LENGTH } from '@/lib/feedback'
import {
  clearActions,
  describeClickable,
  describeForm,
  getRecentActions,
  recordAction,
} from '@/lib/feedbackActions'
import { t, type MessageKey } from '@/lib/i18n'
import { useStudio } from '@/lib/store/studio'
import { isSupabaseConfigured } from '@/lib/supabase/config'

type FeedbackError = Extract<FeedbackResult, { ok: false }>['error']

const ERROR_KEYS: Readonly<Record<FeedbackError, MessageKey>> = {
  empty: 'feedback.errorEmpty',
  tooLong: 'feedback.errorTooLong',
  disabled: 'feedback.errorDisabled',
  failed: 'feedback.errorFailed',
  attachmentTooBig: 'feedback.errorAttachmentTooBig',
}

type AttachError = 'tooBig' | 'unreadable'

const ATTACH_ERROR_KEYS: Readonly<Record<AttachError, MessageKey>> = {
  tooBig: 'feedback.attachTooBig',
  unreadable: 'feedback.attachUnreadable',
}

interface Attached {
  name: string
  type: string
  dataBase64: string
  /** data-URL для превью, только для картинок */
  previewUrl: string | null
  sizeBytes: number
}

const ATTACHMENT_MAX_MB = Math.round(FEEDBACK_ATTACHMENT_MAX_BYTES / (1024 * 1024))

/** Скриншот тяжелее этого не ждём: лучше отправить фидбек без картинки. */
const SCREENSHOT_TIMEOUT_MS = 6000

function fileToAttached(file: File): Promise<Attached> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('read failed'))
    reader.onload = () => {
      const dataUrl = String(reader.result)
      const comma = dataUrl.indexOf(',')
      resolve({
        name: file.name.length > 0 ? file.name : 'clipboard.png',
        type: file.type.length > 0 ? file.type : 'application/octet-stream',
        dataBase64: dataUrl.slice(comma + 1),
        previewUrl: file.type.startsWith('image/') ? dataUrl : null,
        sizeBytes: file.size,
      })
    }
    reader.readAsDataURL(file)
  })
}

/**
 * Скриншот текущего экрана. Донор снимает его html2canvas, но та библиотека не
 * понимает современный CSS-синтаксис цвета, а у нас вся тема на oklch-токенах
 * Tailwind v4 - кадр вышел бы чёрно-белым мусором. Берём html-to-image: он
 * клонирует DOM в foreignObject и рендерит его сам браузер, поэтому oklch,
 * градиенты и слои отрабатывают как есть. Импорт динамический, в основной бандл
 * библиотека не попадает. Best-effort: на любой ошибке и по таймауту null.
 */
async function captureScreenshot(): Promise<string | null> {
  if (typeof window === 'undefined' || document.body === null) return null
  try {
    const { toJpeg } = await import('html-to-image')
    const scale = Math.min(1, 1600 / Math.max(1, window.innerWidth))
    const shot = toJpeg(document.body, {
      quality: 0.75,
      pixelRatio: scale,
      // Окно фидбека в кадр не пускаем: автору нужен экран под попапом.
      filter: (node) => !(node instanceof Element && node.hasAttribute('data-feedback-ui')),
    })
    const timeout = new Promise<null>((resolve) => {
      window.setTimeout(() => resolve(null), SCREENSHOT_TIMEOUT_MS)
    })
    const dataUrl = await Promise.race([shot, timeout])
    if (dataUrl === null) return null
    return dataUrl.slice(dataUrl.indexOf(',') + 1)
  } catch {
    return null
  }
}

export function FeedbackButton() {
  const locale = useStudio((s) => s.locale)
  const [open, setOpen] = useState(false)
  const [body, setBody] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<FeedbackError | null>(null)
  const [attached, setAttached] = useState<Attached | null>(null)
  const [attachError, setAttachError] = useState<AttachError | null>(null)
  const [pending, startTransition] = useTransition()
  const fileInputRef = useRef<HTMLInputElement>(null)
  // Системный диалог выбора файла уводит фокус из окна, и попап считает это
  // взаимодействием снаружи - пытается закрыться и потерять набранный текст.
  // Пока флаг поднят, закрытие игнорируем. Снимается он по возврату фокуса в
  // окно, то есть и при выборе файла, и при отмене в диалоге.
  const pickingFileRef = useRef(false)

  // Вложения живут в приватном bucket Supabase Storage. Без облака класть их
  // некуда, поэтому кнопка прикрепления просто не показывается, а текстовый
  // фидбек продолжает работать как раньше.
  const attachmentsEnabled = isSupabaseConfigured()

  // Лог последних действий пользователя. Слушатели глобальные и в capture-фазе,
  // клики по самому окну фидбека отфильтрованы по data-feedback-ui.
  useEffect(() => {
    recordAction('route', window.location.pathname + window.location.search)
    const onClick = (e: MouseEvent): void => {
      if (!(e.target instanceof Element)) return
      const label = describeClickable(e.target)
      if (label !== null) recordAction('click', label)
    }
    const onSubmit = (e: Event): void => {
      if (!(e.target instanceof HTMLFormElement)) return
      recordAction('submit', describeForm(e.target))
    }
    document.addEventListener('click', onClick, true)
    document.addEventListener('submit', onSubmit, true)
    return () => {
      document.removeEventListener('click', onClick, true)
      document.removeEventListener('submit', onSubmit, true)
    }
  }, [])

  const attachFile = async (file: File): Promise<void> => {
    setAttachError(null)
    if (file.size > FEEDBACK_ATTACHMENT_MAX_BYTES) {
      setAttachError('tooBig')
      return
    }
    try {
      setAttached(await fileToAttached(file))
    } catch {
      setAttachError('unreadable')
    }
  }

  const onPaste = (e: React.ClipboardEvent<HTMLTextAreaElement>): void => {
    if (!attachmentsEnabled) return
    const dt = e.clipboardData
    // Тип элемента буфера не проверяем: при копировании файла из Finder или
    // проводника он часто пустой, и строгая проверка на image/* отбраковала бы
    // нормальную картинку. Сначала files, потом items с kind === 'file'.
    let file: File | null = dt.files.length > 0 ? (dt.files.item(0) ?? null) : null
    if (file === null) {
      for (const item of Array.from(dt.items)) {
        if (item.kind === 'file') {
          file = item.getAsFile()
          if (file !== null) break
        }
      }
    }
    if (file !== null) {
      e.preventDefault()
      void attachFile(file)
    }
  }

  const openFilePicker = (): void => {
    pickingFileRef.current = true
    const release = (): void => {
      pickingFileRef.current = false
      window.removeEventListener('focus', release)
    }
    window.addEventListener('focus', release)
    fileInputRef.current?.click()
  }

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    pickingFileRef.current = false
    const file = e.target.files?.item(0) ?? null
    if (file !== null) void attachFile(file)
    e.target.value = ''
  }

  const onOpenChange = (next: boolean): void => {
    if (pending) return
    if (!next && pickingFileRef.current) return
    setOpen(next)
    if (next) {
      setSent(false)
      return
    }
    setError(null)
    setAttached(null)
    setAttachError(null)
  }

  const onSubmit = (): void => {
    const text = body.trim()
    if (text.length === 0) {
      setError('empty')
      return
    }
    setError(null)
    // Маршрут собираем в момент отправки: хэш содержит закодированный
    // документ и в базу ему не надо, берём только pathname + search.
    const route = window.location.pathname + window.location.search
    const url = window.location.href
    const viewport = `${window.innerWidth}x${window.innerHeight}`
    const actions = getRecentActions()
    startTransition(async () => {
      const screenshot = attachmentsEnabled ? await captureScreenshot() : null
      const res = await submitFeedbackAction({
        body: text,
        route,
        locale,
        url,
        viewport,
        actions,
        ...(attached !== null && attachmentsEnabled
          ? {
              attachment: {
                name: attached.name,
                type: attached.type,
                dataBase64: attached.dataBase64,
              },
            }
          : {}),
        ...(screenshot !== null ? { screenshot: { dataBase64: screenshot } } : {}),
      })
      if (res.ok) {
        setBody('')
        setAttached(null)
        setAttachError(null)
        setSent(true)
        clearActions()
      } else {
        setError(res.error)
      }
    })
  }

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger
        data-feedback-ui
        data-testid="feedback-button"
        aria-label={t(locale, 'feedback.open')}
        className={buttonVariants({ variant: 'default', size: 'icon', className: 'fixed right-4 bottom-4 z-40 rounded-full shadow-lg' })}
      >
        <MessageSquarePlus />
      </PopoverTrigger>
      <PopoverContent data-feedback-ui side="top" align="end" className="w-[340px]">
        <div className="flex flex-col gap-2.5">
          <div className="flex items-center gap-1.5">
            <h3 className="text-sm font-semibold">{t(locale, 'feedback.title')}</h3>
            <HelpHint id="feedback" side="left" />
          </div>
          <p className="text-[13px] leading-normal text-ink-secondary">{t(locale, 'feedback.hint')}</p>

          {sent ? (
            <p data-testid="feedback-sent" className="text-sm text-ink">
              {t(locale, 'feedback.sent')}
            </p>
          ) : (
            <>
              <Textarea
                data-testid="feedback-text"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                onPaste={onPaste}
                maxLength={FEEDBACK_MAX_LENGTH}
                placeholder={t(locale, 'feedback.placeholder')}
                disabled={pending}
              />

              {attachmentsEnabled ? (
                <div className="flex flex-col gap-1.5">
                  {attached === null ? (
                    <Button
                      variant="outline"
                      size="sm"
                      data-testid="feedback-attach"
                      onClick={openFilePicker}
                      disabled={pending}
                      className="self-start"
                    >
                      <Paperclip data-icon="inline-start" />
                      {t(locale, 'feedback.attach')}
                    </Button>
                  ) : (
                    <div
                      data-testid="feedback-attachment"
                      className="flex items-center gap-2 rounded-sm border border-line-subtle bg-surface p-1.5"
                    >
                      {attached.previewUrl === null ? (
                        <Paperclip className="size-5 shrink-0 text-ink-muted" />
                      ) : (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={attached.previewUrl}
                          alt={attached.name}
                          className="size-10 shrink-0 rounded-xs object-cover"
                        />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[13px] text-ink">{attached.name}</div>
                        <div className="font-mono text-[11px] text-ink-muted tabular-nums">
                          {t(locale, 'feedback.attachSize', {
                            kb: Math.max(1, Math.round(attached.sizeBytes / 1024)),
                          })}
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        data-testid="feedback-attach-remove"
                        aria-label={t(locale, 'feedback.attachRemove')}
                        onClick={() => setAttached(null)}
                        disabled={pending}
                      >
                        <X />
                      </Button>
                    </div>
                  )}
                  <input
                    ref={fileInputRef}
                    type="file"
                    data-testid="feedback-file-input"
                    className="hidden"
                    onChange={onFileChange}
                  />
                  {attachError !== null ? (
                    <p role="alert" data-testid="feedback-attach-error" className="text-[13px] text-error-text">
                      {t(locale, ATTACH_ERROR_KEYS[attachError], { max: ATTACHMENT_MAX_MB })}
                    </p>
                  ) : null}
                  <p className="text-[11px] leading-normal text-ink-muted">
                    {t(locale, 'feedback.autoNote')}
                  </p>
                </div>
              ) : null}

              <div className="flex items-center justify-between">
                <span data-testid="feedback-counter" className="font-mono text-[11px] text-ink-muted tabular-nums">
                  {t(locale, 'feedback.counter', { used: body.length, max: FEEDBACK_MAX_LENGTH })}
                </span>
                <Button
                  size="sm"
                  data-testid="feedback-submit"
                  onClick={onSubmit}
                  disabled={pending || body.trim().length === 0}
                >
                  {pending ? t(locale, 'feedback.busy') : t(locale, 'feedback.submit')}
                </Button>
              </div>

              {error !== null ? (
                <p role="alert" data-testid="feedback-error" className="text-sm text-error-text">
                  {t(locale, ERROR_KEYS[error], { max: FEEDBACK_MAX_LENGTH })}
                </p>
              ) : null}
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
