import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ShotStrip } from './ShotStrip'

// AuthCta переехала внутрь лайтбокса и требует эти зависимости при рендере своей формы -
// здесь диалог никогда не открывается, но моки нужны на случай если это изменится.
vi.mock('@/lib/supabase/browser', () => ({
  getSupabaseBrowser: () => ({ auth: { signInWithPassword: vi.fn(), signUp: vi.fn(), signInWithOAuth: vi.fn() } }),
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))

describe('ShotStrip', () => {
  it('не содержит кнопку призыва к действию в самом блоке', () => {
    render(<ShotStrip locale="ru" />)
    expect(screen.queryByTestId('landing-cta-shots')).toBeNull()
    expect(screen.queryByRole('link', { name: /начать/i })).toBeNull()
  })

  it('рисует заголовок блока и ленту снимков', () => {
    render(<ShotStrip locale="ru" />)
    expect(screen.getByTestId('landing-shots')).toBeInTheDocument()
    expect(screen.getAllByRole('button').length).toBeGreaterThan(0)
  })
})
