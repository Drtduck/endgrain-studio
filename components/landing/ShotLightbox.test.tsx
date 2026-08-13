import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ShotLightbox } from './ShotLightbox'
import { t } from '@/lib/i18n'

const SHOTS = [
  { slug: 'editor', src: '/landing/shots/ru/editor.png', label: 'Редактор' },
  { slug: 'templates', src: '/landing/shots/ru/templates.png', label: 'Шаблоны' },
] as const

describe('ShotLightbox', () => {
  it('рисует триггер на каждый снимок и оставляет testid на самой картинке', () => {
    render(<ShotLightbox locale="ru" shots={SHOTS} />)
    expect(screen.getAllByRole('button')).toHaveLength(2)
    const img = screen.getByTestId('landing-shot-editor')
    expect(img.tagName).toBe('IMG')
    expect(img).toHaveAttribute('alt', 'Редактор')
    expect(img).toHaveAttribute('src', '/landing/shots/ru/editor.png')
    expect(screen.getByTestId('landing-shot-templates')).toBeInTheDocument()
  })

  it('aria-label триггера на русском называет снимок', () => {
    render(<ShotLightbox locale="ru" shots={SHOTS} />)
    expect(screen.getByTestId('landing-shot-trigger-editor')).toHaveAttribute(
      'aria-label',
      t('ru', 'landing.shots.open', { name: 'Редактор' })
    )
  })

  it('клик по снимку открывает полноразмерный просмотр', async () => {
    render(<ShotLightbox locale="ru" shots={SHOTS} />)
    fireEvent.click(screen.getByTestId('landing-shot-trigger-editor'))

    const dialog = await screen.findByTestId('landing-shot-dialog')
    expect(dialog.textContent ?? '').toContain('Редактор')
    expect(screen.getByTestId('landing-shot-dialog-image')).toHaveAttribute('src', '/landing/shots/ru/editor.png')
  })

  it('Escape закрывает просмотр', async () => {
    render(<ShotLightbox locale="ru" shots={SHOTS} />)
    fireEvent.click(screen.getByTestId('landing-shot-trigger-editor'))
    await screen.findByTestId('landing-shot-dialog')

    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByTestId('landing-shot-dialog')).toBeNull())
  })

  it('крестик закрывает просмотр и возвращает фокус на триггер', async () => {
    render(<ShotLightbox locale="ru" shots={SHOTS} />)
    const trigger = screen.getByTestId('landing-shot-trigger-templates')
    fireEvent.click(trigger)
    await screen.findByTestId('landing-shot-dialog')

    fireEvent.click(screen.getByTestId('landing-shot-dialog-close'))
    await waitFor(() => expect(screen.queryByTestId('landing-shot-dialog')).toBeNull())
    await waitFor(() => expect(document.activeElement).toBe(trigger))
  })

  it('на английской локали подписи и aria-label английские', async () => {
    const shots = [{ slug: 'editor', src: '/landing/shots/en/editor.png', label: 'Editor' }]
    render(<ShotLightbox locale="en" shots={shots} />)
    const trigger = screen.getByTestId('landing-shot-trigger-editor')
    expect(trigger).toHaveAttribute('aria-label', t('en', 'landing.shots.open', { name: 'Editor' }))

    fireEvent.click(trigger)
    await screen.findByTestId('landing-shot-dialog')
    expect(screen.getByTestId('landing-shot-dialog-close')).toHaveAttribute(
      'aria-label',
      t('en', 'landing.shots.close')
    )
  })
})
