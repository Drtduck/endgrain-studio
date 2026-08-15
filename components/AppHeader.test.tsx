import { describe, it, expect, beforeEach, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { ProProvider } from '@/components/ProProvider'
import { SessionProvider } from '@/components/SessionProvider'
import { aiAccess } from '@/lib/ai/quota'
import { makeCheckerboard } from '@/lib/designs/samples'
import type { ProStatus } from '@/lib/stripe/pro'
import { useStudio } from '@/lib/store/studio'
import { AppHeader } from './AppHeader'

vi.mock('@/app/actions/auth', () => ({ signOutAction: vi.fn() }))

const refresh = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))

const FREE: ProStatus = { pro: false, reason: 'free', plan: null, currentPeriodEnd: null, cancelAtPeriodEnd: false }

function renderHeader(props: Parameters<typeof AppHeader>[0] = {}) {
  return render(
    <SessionProvider value={{ user: null, enabled: true }}>
      <ProProvider
        value={{ status: FREE, billingEnabled: false, ai: aiAccess('mock'), merch: { enabled: false, prices: { tshirt: 0, mug: 0, poster: 0, apron: 0 } } }}
      >
        <AppHeader {...props} />
      </ProProvider>
    </SessionProvider>,
  )
}

describe('AppHeader', () => {
  beforeEach(() => {
    refresh.mockClear()
    window.localStorage.clear()
    useStudio.getState().resetStudio(makeCheckerboard({ cols: 2, rows: 2 }))
    useStudio.getState().setLocale('ru')
    useStudio.getState().setUnit('mm')
  })

  it('по умолчанию рисует бренд, язык и профиль без вкладок и единиц', () => {
    renderHeader()
    expect(screen.getByTestId('app-header')).toBeDefined()
    expect(screen.getByTestId('locale-ru')).toBeDefined()
    expect(screen.getByTestId('account-login')).toBeDefined()
    expect(screen.queryByTestId('tab-editor')).toBe(null)
    expect(screen.queryByTestId('unit-mm')).toBe(null)
  })

  it('логотип ведёт на главную приложения', () => {
    renderHeader()
    expect(screen.getByTestId('app-header-home').getAttribute('href')).toBe('/')
  })

  it('в режиме студии добавляет вкладки и переключатель единиц', () => {
    renderHeader({ tabs: true, units: true })
    expect(screen.getByTestId('tab-editor')).toBeDefined()
    fireEvent.click(screen.getByTestId('unit-in'))
    expect(useStudio.getState().unit).toBe('in')
  })

  it('переключатель языка меняет локаль стора', () => {
    renderHeader()
    fireEvent.click(screen.getByTestId('locale-en'))
    expect(useStudio.getState().locale).toBe('en')
  })

  it('переключение языка перечитывает серверные компоненты через router.refresh()', () => {
    renderHeader()
    fireEvent.click(screen.getByTestId('locale-en'))
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('инструменты студии рендерятся только когда переданы', () => {
    renderHeader({ tools: <button data-testid="header-tool" type="button" /> })
    expect(screen.getByTestId('header-tool')).toBeDefined()
  })

  it('набор разделов одинаков и для студии, и для остальных страниц', () => {
    const { unmount } = render(<AppHeader />)
    const outside = ['app-shell-nav-gallery', 'app-blog-link']
    for (const id of outside) expect(screen.getByTestId(id)).toBeInTheDocument()
    unmount()

    render(<AppHeader tabs />)
    for (const id of outside) expect(screen.getByTestId(id)).toBeInTheDocument()
    // В студии ссылка «Студия» лишняя: туда ведут вкладки и логотип.
    expect(screen.queryByTestId('app-shell-nav-studio')).toBeNull()
  })

  it('тарифы, профиль и ключи API из шапки убраны: им место в меню аватара', () => {
    renderHeader({ tabs: true, units: true })
    expect(screen.queryByTestId('app-shell-nav-pricing')).toBeNull()
    expect(screen.queryByTestId('studio-nav-account')).toBeNull()
    expect(screen.queryByTestId('app-shell-nav-api')).toBeNull()
  })

  it('разделы стоят левее переключателя мер в обоих вариантах шапки', () => {
    const { unmount } = renderHeader({ tabs: true, units: true })
    const before = Node.DOCUMENT_POSITION_FOLLOWING
    expect(screen.getByTestId('app-shell-nav-gallery').compareDocumentPosition(screen.getByTestId('unit-mm'))).toBe(
      before,
    )
    expect(screen.getByTestId('app-blog-link').compareDocumentPosition(screen.getByTestId('unit-mm'))).toBe(before)
    unmount()

    // На app-страницах единиц нет, но порядок «студия -> галерея -> блог -> язык» держится.
    renderHeader()
    expect(screen.getByTestId('app-shell-nav-studio').compareDocumentPosition(screen.getByTestId('app-blog-link'))).toBe(
      before,
    )
    expect(screen.getByTestId('app-blog-link').compareDocumentPosition(screen.getByTestId('locale-ru'))).toBe(before)
  })
})
