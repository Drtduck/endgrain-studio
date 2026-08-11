import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { LocaleToggle } from './LocaleToggle'

describe('LocaleToggle', () => {
  it('localizes the group aria-label instead of hardcoding Russian', () => {
    const { container, rerender } = render(<LocaleToggle locale="ru" onChange={() => {}} />)
    expect(container.querySelector('[role="group"]')?.getAttribute('aria-label')).toBe('язык интерфейса')
    rerender(<LocaleToggle locale="en" onChange={() => {}} />)
    expect(container.querySelector('[role="group"]')?.getAttribute('aria-label')).toBe('interface language')
  })

  it('reflects the active locale on document.documentElement.lang', () => {
    const { rerender } = render(<LocaleToggle locale="ru" onChange={() => {}} />)
    expect(document.documentElement.lang).toBe('ru')
    rerender(<LocaleToggle locale="en" onChange={() => {}} />)
    expect(document.documentElement.lang).toBe('en')
  })
})
