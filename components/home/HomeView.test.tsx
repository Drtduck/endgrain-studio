import { describe, it, expect, beforeEach } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { SessionProvider } from '@/components/SessionProvider'
import { useStudio } from '@/lib/store/studio'
import { HomeView, greetingName } from './HomeView'

const USER = { id: 'u1', email: 'drtloki@gmail.com' }

function renderGuest() {
  return render(
    <SessionProvider value={{ user: null, enabled: true }}>
      <HomeView />
    </SessionProvider>,
  )
}

function renderSignedIn() {
  return render(
    <SessionProvider value={{ user: USER, enabled: true }}>
      <HomeView />
    </SessionProvider>,
  )
}

describe('HomeView', () => {
  beforeEach(() => {
    useStudio.getState().resetStudio()
    useStudio.getState().setLocale('ru')
  })

  it('показывает карточку каждого раздела, кроме облачных проектов', () => {
    renderGuest()
    for (const view of ['editor', 'templates', 'generate', 'photo', 'view3d', 'books', 'promo']) {
      expect(screen.getByTestId(`home-card-${view}`)).toBeDefined()
    }
    expect(screen.queryByTestId('home-card-projects')).toBe(null)
  })

  it('вошедшему добавляет карточку облачных проектов', () => {
    renderSignedIn()
    expect(screen.getByTestId('home-card-projects')).toBeDefined()
  })

  it('карточка проектов скрыта, когда Supabase не настроен', () => {
    render(
      <SessionProvider value={{ user: USER, enabled: false }}>
        <HomeView />
      </SessionProvider>,
    )
    expect(screen.queryByTestId('home-card-projects')).toBe(null)
  })

  it('клик по карточке переключает вкладку студии', () => {
    renderGuest()
    fireEvent.click(screen.getByTestId('home-card-photo'))
    expect(useStudio.getState().view).toBe('photo')
  })

  it('карточка это кнопка: доступна с клавиатуры', () => {
    renderGuest()
    const card = screen.getByTestId('home-card-editor')
    expect(card.tagName).toBe('BUTTON')
    card.focus()
    expect(document.activeElement).toBe(card)
    fireEvent.keyDown(card, { key: 'Enter' })
    fireEvent.click(card)
    expect(useStudio.getState().view).toBe('editor')
  })

  it('иконки берутся из фирменного набора и не читаются скринридером', () => {
    renderGuest()
    const icon = screen.getByTestId('home-card-books').querySelector('img')
    expect(icon?.getAttribute('src')).toBe('/brand/icons/books.png')
    expect(icon?.getAttribute('alt')).toBe('')
  })

  it('гостя приветствует нейтрально, без имени', () => {
    renderGuest()
    expect(screen.getByTestId('home-greeting').textContent).toBe('Здравствуйте')
  })

  it('вошедшего зовёт по имени из почты', () => {
    renderSignedIn()
    expect(screen.getByTestId('home-greeting').textContent).toBe('С возвращением, Drtloki')
  })

  it('переезжает на английский вместе с интерфейсом', () => {
    useStudio.getState().setLocale('en')
    renderSignedIn()
    expect(screen.getByTestId('home-greeting').textContent).toBe('Welcome back, Drtloki')
    expect(screen.getByTestId('home-card-editor').textContent).toContain('Editor')
    expect(screen.getByTestId('home-card-projects').textContent).toContain('My projects')
  })

  it('английский гость видит нейтральное приветствие', () => {
    useStudio.getState().setLocale('en')
    renderGuest()
    expect(screen.getByTestId('home-greeting').textContent).toBe('Hello')
  })

  it('greetingName берёт часть почты до собаки и поднимает первую букву', () => {
    expect(greetingName('stan@example.com')).toBe('Stan')
    expect(greetingName('')).toBe('')
  })
})
