import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PatternMarquee } from './PatternMarquee'
import { TEMPLATES } from '@/lib/designs/templates'
import { APP_ORIGIN } from '@/lib/routing/host'

const HALF = Math.ceil(TEMPLATES.length / 2)

function track(rowTestId: string): HTMLElement {
  const row = screen.getByTestId(rowTestId)
  const el = row.querySelector<HTMLElement>('.eg-marquee-track')
  expect(el).not.toBeNull()
  return el as HTMLElement
}

describe('PatternMarquee', () => {
  it('рисует оба ряда внутри общего контейнера', () => {
    render(<PatternMarquee locale="ru" />)
    expect(screen.getByTestId('landing-pattern-marquee')).toBeTruthy()
    expect(screen.getByTestId('landing-marquee-row-a')).toBeTruthy()
    expect(screen.getByTestId('landing-marquee-row-b')).toBeTruthy()
  })

  it('дублирует набор каждого ряда, не теряя ни одного шаблона', () => {
    const { container } = render(<PatternMarquee locale="ru" />)
    expect(screen.getByTestId('landing-marquee-row-a').querySelectorAll('img')).toHaveLength(HALF * 2)
    expect(screen.getByTestId('landing-marquee-row-b').querySelectorAll('img')).toHaveLength(
      (TEMPLATES.length - HALF) * 2,
    )
    // Уникальных карточек ровно столько же, сколько шаблонов в библиотеке.
    const unique = container.querySelectorAll('a[data-testid^="landing-pattern-"]')
    expect(unique).toHaveLength(TEMPLATES.length)
    for (const tpl of TEMPLATES) {
      expect(container.querySelectorAll(`[data-testid="landing-pattern-${tpl.id}"]`)).toHaveLength(1)
    }
  })

  it('пускает ряды навстречу друг другу с разной скоростью', () => {
    render(<PatternMarquee locale="ru" />)
    const a = track('landing-marquee-row-a')
    const b = track('landing-marquee-row-b')
    expect(a.classList.contains('eg-marquee-reverse')).toBe(false)
    expect(b.classList.contains('eg-marquee-reverse')).toBe(true)

    const durA = a.style.getPropertyValue('--eg-marquee-dur')
    const durB = b.style.getPropertyValue('--eg-marquee-dur')
    expect(durA).toMatch(/^\d+s$/)
    expect(durB).toMatch(/^\d+s$/)
    expect(durA).not.toBe(durB)
  })

  it('ведёт каждую карточку в студию', () => {
    const { container } = render(<PatternMarquee locale="ru" />)
    const links = container.querySelectorAll('a')
    expect(links.length).toBe(TEMPLATES.length * 2)
    for (const link of links) expect(link.getAttribute('href')).toBe(APP_ORIGIN)
  })

  it('прячет клоны от скринридера и клавиатуры', () => {
    const { container } = render(<PatternMarquee locale="ru" />)
    const clones = container.querySelectorAll('a[aria-hidden="true"]')
    expect(clones).toHaveLength(TEMPLATES.length)
    for (const clone of clones) {
      expect(clone.getAttribute('tabindex')).toBe('-1')
      expect(clone.getAttribute('data-testid')).toBeNull()
      expect(clone.querySelector('img')?.getAttribute('alt')).toBe('')
    }
  })

  it('сохраняет классы hover-эффекта на карточке и фото', () => {
    const { container } = render(<PatternMarquee locale="ru" />)
    const card = container.querySelector<HTMLAnchorElement>('a[data-testid^="landing-pattern-"]')
    expect(card?.classList.contains('eg-photo-card')).toBe(true)
    expect(card?.querySelector('img')?.classList.contains('eg-photo-zoom')).toBe(true)
  })
})
