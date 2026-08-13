import type { ReactNode } from 'react'

/**
 * Блок-ответ сразу после H1: два-три предложения, которые полностью отвечают
 * на вопрос из заголовка, без «в этой статье мы разберём». Это тот самый абзац,
 * который ИИ-ассистент вырежет и процитирует - остальной текст он использует
 * как подтверждение. Текст блока дублирует meta.answer статьи.
 */
export function Answer({ children }: { children: ReactNode }) {
  return (
    <p
      data-testid="blog-answer"
      className="mt-6 rounded-md border border-accent-border bg-accent-soft px-4 py-3 font-sans text-lg leading-relaxed text-ink"
    >
      {children}
    </p>
  )
}
