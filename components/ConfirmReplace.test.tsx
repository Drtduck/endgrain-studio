import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { ConfirmReplace } from './ConfirmReplace'

function setup(overrides: Partial<Parameters<typeof ConfirmReplace>[0]> = {}) {
  const onConfirm = vi.fn()
  const onCancel = vi.fn()
  render(
    <ConfirmReplace
      testId="generator"
      title="Заменить текущий проект?"
      body="Узор заменит доску целиком."
      confirmLabel="Заменить"
      cancelLabel="Отмена"
      onConfirm={onConfirm}
      onCancel={onCancel}
      {...overrides}
    />,
  )
  return { onConfirm, onCancel }
}

describe('ConfirmReplace', () => {
  it('показывает заголовок и текст', () => {
    setup()
    expect(screen.getByTestId('generator-confirm-dialog')).toBeDefined()
    expect(screen.getByText('Заменить текущий проект?')).toBeDefined()
    expect(screen.getByText('Узор заменит доску целиком.')).toBeDefined()
  })

  it('это модальный диалог с доступным именем', () => {
    setup()
    const dialog = screen.getByRole('dialog')
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    expect(dialog.getAttribute('aria-label')).toBe('Заменить текущий проект?')
  })

  it('кнопки зовут свои обработчики', () => {
    const { onConfirm, onCancel } = setup()
    fireEvent.click(screen.getByTestId('generator-confirm'))
    expect(onConfirm).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByTestId('generator-cancel'))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('идентификаторы шаблонов сохранены ради существующих e2e', () => {
    setup({ testId: 'template' })
    expect(screen.getByTestId('template-confirm-dialog')).toBeDefined()
    expect(screen.getByTestId('template-confirm')).toBeDefined()
    expect(screen.getByTestId('template-cancel')).toBeDefined()
  })

  it('закрывается по Escape через onCancel', () => {
    const { onCancel } = setup()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('ставит фокус на первый элемент при открытии', () => {
    setup()
    expect(document.activeElement).toBe(screen.getByTestId('generator-cancel'))
  })

  it('запирает Tab внутри диалога: с последней кнопки уходит на первую', () => {
    setup()
    const cancelBtn = screen.getByTestId('generator-cancel')
    const confirmBtn = screen.getByTestId('generator-confirm')
    confirmBtn.focus()
    expect(document.activeElement).toBe(confirmBtn)
    fireEvent.keyDown(window, { key: 'Tab' })
    expect(document.activeElement).toBe(cancelBtn)
  })

  it('запирает Shift+Tab: с первой кнопки уходит на последнюю', () => {
    setup()
    const cancelBtn = screen.getByTestId('generator-cancel')
    const confirmBtn = screen.getByTestId('generator-confirm')
    expect(document.activeElement).toBe(cancelBtn)
    fireEvent.keyDown(window, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(confirmBtn)
  })
})
