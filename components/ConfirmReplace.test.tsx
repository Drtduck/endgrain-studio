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
})
