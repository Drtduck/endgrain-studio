import { expect, test, type Page } from '@playwright/test'

async function openLanding(page: Page, locale: 'ru' | 'en' = 'ru'): Promise<void> {
  await page.context().addCookies([{ name: 'eg-locale', value: locale, url: 'http://127.0.0.1:3100' }])
  await page.goto('/landing')
  await expect(page.getByTestId('landing')).toBeVisible()
}

test('лендинг открывается на русском и несёт слоган', async ({ page }) => {
  await openLanding(page, 'ru')
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Пилим как надо')
})

test('переключатель языка меняет копирайт', async ({ page }) => {
  await openLanding(page, 'ru')
  await page.getByTestId('landing-locale-en').click()
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Rip it right')
  const cookies = await page.context().cookies()
  const locale = cookies.find((c) => c.name === 'eg-locale')
  expect(locale?.value).toBe('en')
})

test('витрина показывает фото досок', async ({ page }) => {
  await openLanding(page)
  const grid = page.getByTestId('landing-pattern-grid')
  await expect(grid).toBeVisible()
  const shots = grid.locator('img')
  await expect(shots).toHaveCount(16)

  // Каждая карточка обязана нести осмысленный alt и реально загрузиться,
  // иначе блок молча превратится в сетку битых иконок.
  const first = shots.first()
  await expect(first).toHaveAttribute('alt', /.{10,}/)
  await expect(async () => {
    const loaded = await first.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)
    expect(loaded).toBe(true)
  }).toPass()
})

test('кнопки ведут на поддомен студии', async ({ page }) => {
  await openLanding(page)
  await expect(page.getByTestId('landing-cta-hero')).toHaveAttribute('href', /app\.endgrain\.app/)
})

test('подвал несёт дисклеймер Amazon и строку про приватность', async ({ page }) => {
  await openLanding(page)
  const footer = page.getByTestId('landing-footer')
  await expect(footer).toContainText('Amazon')
  await expect(footer).toContainText(/не передаём почту/i)
})

test('форма подписки валидирует адрес и честно сообщает, что почта не подключена', async ({ page }) => {
  await openLanding(page)
  await page.getByTestId('subscribe-email').fill('не-почта')
  await page.getByTestId('subscribe-submit').click()
  await expect(page.getByTestId('subscribe-error')).toBeVisible()

  await page.getByTestId('subscribe-email').fill('stas@example.com')
  await page.getByTestId('subscribe-submit').click()
  // В CI переменных Resend нет, экшен обязан ответить честной заглушкой,
  // а не молча притвориться успехом. Локально, если разработчик уже прописал
  // .env.local, Resend отбивает домен example.com как невалидный и вернёт
  // failed, а не disabled, поэтому ждём любой из двух честных ответов.
  await expect(page.getByTestId('subscribe-error')).toContainText(/пока не подключена|Не получилось отправить/)
})

test('студия на корне не изменилась', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('board-canvas')).toBeVisible()
  await expect(page.getByTestId('landing')).toHaveCount(0)
})

test('витрина уважает prefers-reduced-motion', async ({ page }) => {
  await openLanding(page)
  const card = page.getByTestId('landing-pattern-grid').locator('.eg-photo-card').first()
  await expect(card).toHaveCount(1)

  await page.emulateMedia({ reducedMotion: 'reduce' })
  await card.hover()
  await expect(async () => {
    const transform = await card.evaluate((el) => getComputedStyle(el).transform)
    expect(transform).toBe('none')
  }).toPass()
})
