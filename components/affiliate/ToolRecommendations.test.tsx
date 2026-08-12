import { act, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { makeCheckerboard } from '@/lib/designs/samples'
import { useStudio } from '@/lib/store/studio'
import { ToolRecommendations } from './ToolRecommendations'

describe('ToolRecommendations', () => {
  beforeEach(() => {
    act(() => {
      useStudio.getState().resetStudio()
    })
  })

  it('показывает блок с заголовком и дисклеймером', () => {
    render(<ToolRecommendations />)
    const block = screen.getByTestId('tool-recommendations')
    expect(block).toBeTruthy()
    expect(screen.getByTestId('recommend-disclosure').textContent).toContain('Amazon')
  })

  it('каждая ссылка партнёрская и открывается в новой вкладке', () => {
    render(<ToolRecommendations />)
    const links = screen.getByTestId('tool-recommendations').querySelectorAll('a[data-testid^="recommend-"]')
    expect(links.length).toBeGreaterThan(0)
    for (const link of links) {
      expect(link.getAttribute('rel')).toBe('sponsored noopener noreferrer')
      expect(link.getAttribute('target')).toBe('_blank')
      expect(link.getAttribute('href')?.includes('amazon.')).toBe(true)
    }
  })

  it('у каждой карточки есть картинка товара', () => {
    render(<ToolRecommendations />)
    const links = screen.getByTestId('tool-recommendations').querySelectorAll('a[data-testid^="recommend-"]')
    expect(links.length).toBeGreaterThan(0)
    for (const link of links) {
      const img = link.querySelector('img')
      expect(img).not.toBeNull()
      expect(img?.getAttribute('src')).toMatch(/^https:\/\//)
      expect(img?.getAttribute('loading')).toBe('lazy')
      expect(img?.getAttribute('alt')).not.toBe('')
    }
  })

  it('реагирует на параметры проекта: узкий рейсмус приводит циклю', () => {
    render(<ToolRecommendations />)
    expect(screen.queryByTestId('recommend-scraper-card')).toBeNull()
    act(() => {
      useStudio.getState().loadDesign({ ...makeCheckerboard(), planerWidthMm: 100 })
    })
    expect(screen.getByTestId('recommend-scraper-card')).toBeTruthy()
  })
})
