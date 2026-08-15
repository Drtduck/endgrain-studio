import { describe, it, expect, beforeEach } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { useStudio } from '@/lib/store/studio'
import { HowToGuide } from './HowToGuide'

describe('HowToGuide', () => {
  beforeEach(() => {
    useStudio.getState().resetStudio()
    useStudio.getState().setLocale('ru')
  })

  it('свёрнут показывает первые три шага, остальные прячет', () => {
    render(<HowToGuide />)
    expect(screen.getByTestId('home-howto')).toBeDefined()
    expect(screen.getByTestId('home-howto-step-1')).toBeDefined()
    expect(screen.getByTestId('home-howto-step-3')).toBeDefined()
    expect(screen.queryByTestId('home-howto-step-4')).toBe(null)
    expect(screen.queryByTestId('home-howto-step-9')).toBe(null)
  })

  it('первый шаг рассказывает про сборку узора, а не про конкретные размеры', () => {
    render(<HowToGuide />)
    const first = screen.getByTestId('home-howto-step-1')
    expect(first.textContent).toContain('Соберите узор')
    expect(first.textContent).not.toMatch(/\d+\s*×\s*\d+/)
  })

  it('кнопка раскрывает все девять шагов и сворачивает обратно', () => {
    render(<HowToGuide />)
    const toggle = screen.getByTestId('home-howto-toggle')
    expect(toggle.getAttribute('aria-expanded')).toBe('false')

    fireEvent.click(toggle)
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByTestId('home-howto-step-9')).toBeDefined()
    expect(toggle.textContent).toContain('Свернуть')

    fireEvent.click(toggle)
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByTestId('home-howto-step-9')).toBe(null)
  })

  it('кнопка это button и доступна с клавиатуры, список связан через aria-controls', () => {
    render(<HowToGuide />)
    const toggle = screen.getByTestId('home-howto-toggle')
    expect(toggle.tagName).toBe('BUTTON')
    toggle.focus()
    expect(document.activeElement).toBe(toggle)
    expect(toggle.getAttribute('aria-controls')).toBe(screen.getByTestId('home-howto-steps').id)
  })

  it('шаги нумерованы списком ol, номер не читается скринридером', () => {
    render(<HowToGuide />)
    const list = screen.getByTestId('home-howto-steps')
    expect(list.tagName).toBe('OL')
    expect(list.querySelector('[aria-hidden]')?.textContent).toBe('1')
  })

  it('переезжает на английский вместе с интерфейсом', () => {
    useStudio.getState().setLocale('en')
    render(<HowToGuide />)
    expect(screen.getByTestId('home-howto').textContent).toContain('How to build the board from your project')
    expect(screen.getByTestId('home-howto-step-1').textContent).toContain('Lay out the pattern')
    expect(screen.getByTestId('home-howto-toggle').textContent).toContain('6 more steps')
  })
})
