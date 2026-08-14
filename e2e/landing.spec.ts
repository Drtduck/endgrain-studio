import { expect, test, type Page } from '@playwright/test'
import { presetConsent } from './helpers/consent'

test.beforeEach(async ({ page }) => {
  await presetConsent(page)
})

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
  const grid = page.getByTestId('landing-pattern-marquee')
  await expect(grid).toBeVisible()
  const shots = grid.locator('img')
  // 20 шаблонов, каждый отрисован дважды ради бесшовной петли ленты.
  await expect(shots).toHaveCount(40)

  // Оригиналы несут осмысленный alt, клоны петли идут пустым alt и скрыты от читалки:
  // ровно 20 картинок с подписью и ровно 20 aria-hidden, иначе лента озвучится дважды.
  await expect(grid.locator('img[alt]:not([alt=""])')).toHaveCount(20)
  await expect(grid.locator('img[alt=""]')).toHaveCount(20)
  const first = shots.first()
  await expect(first).toHaveAttribute('alt', /.{10,}/)

  // Хотя бы одна картинка обязана реально загрузиться, иначе блок молча
  // превратится в сетку битых иконок.
  await expect(async () => {
    const loaded = await first.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)
    expect(loaded).toBe(true)
  }).toPass()
})

const CTA_IDS = ['landing-cta-header', 'landing-cta-hero', 'landing-cta-final'] as const

test('кнопки открывают окно входа и сохраняют ссылку на страницу регистрации', async ({ page }) => {
  await openLanding(page)
  const dialog = page.getByTestId('landing-auth-dialog')

  for (const id of CTA_IDS) {
    const cta = page.getByTestId(id)
    // Ссылка остаётся запасным входом: она обязана пережить появление модалки.
    await expect(cta).toHaveAttribute('href', /app\.endgrain\.app\/register/)
    await cta.click()
    await expect(dialog).toBeVisible()
    await expect(page.getByTestId('auth-form-register')).toBeVisible()
    // Клик по кнопке не уводит человека со страницы.
    await expect(page).toHaveURL(/\/landing/)
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
  }
})

test('окно входа закрывается по Escape, клику вне и крестику, фокус возвращается на кнопку', async ({ page }) => {
  await openLanding(page)
  const trigger = page.getByTestId('landing-cta-hero')
  const dialog = page.getByTestId('landing-auth-dialog')

  await trigger.click()
  await expect(dialog).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)

  await trigger.click()
  await expect(dialog).toBeVisible()
  await page.getByTestId('landing-auth-dialog-backdrop').click({ position: { x: 5, y: 5 } })
  await expect(dialog).toHaveCount(0)

  await trigger.click()
  await expect(dialog).toBeVisible()
  await page.getByTestId('landing-auth-dialog-close').click()
  await expect(dialog).toHaveCount(0)

  await expect(async () => {
    const focused = await page.evaluate(() => document.activeElement?.getAttribute('data-testid'))
    expect(focused).toBe('landing-cta-hero')
  }).toPass()
})

test('окно переключается между регистрацией и входом на обоих языках', async ({ page }) => {
  await openLanding(page, 'ru')
  const dialog = page.getByTestId('landing-auth-dialog')

  await page.getByTestId('landing-cta-hero').click()
  // Заголовок окна теперь всегда название продукта, режим виден по форме и кнопке.
  await expect(dialog).toContainText('Endgrain App')
  await expect(page.getByTestId('auth-form-register')).toBeVisible()
  await page.getByTestId('landing-auth-switch').click()
  await expect(page.getByTestId('auth-form-login')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)

  await page.getByTestId('landing-locale-en').click()
  await page.getByTestId('landing-cta-hero').click()
  await expect(page.getByTestId('auth-form-register')).toBeVisible()
  await page.getByTestId('landing-auth-switch').click()
  await expect(page.getByTestId('auth-form-login')).toBeVisible()
})

test.describe('без JavaScript', () => {
  test.use({ javaScriptEnabled: false })

  // Запасной вход обязан работать разметкой: без JS кнопка это обычная ссылка на /register.
  test('кнопка ведёт на страницу регистрации', async ({ page }) => {
    await page.goto('/landing')
    const cta = page.getByTestId('landing-cta-hero')
    await expect(cta).toHaveAttribute('href', /app\.endgrain\.app\/register/)
    await page.goto('/register')
    await expect(page.getByTestId('auth-form-register')).toBeVisible()
  })
})

test('снимок открывается в полноразмерном просмотре', async ({ page }) => {
  await openLanding(page)
  await page.getByTestId('landing-shot-trigger-editor').click()

  // Диалог живёт в портале, вне секции landing-shots: искать только от page.
  await expect(page.getByTestId('landing-shot-dialog')).toBeVisible()
  const image = page.getByTestId('landing-shot-dialog-image')
  await expect(async () => {
    const loaded = await image.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)
    expect(loaded).toBe(true)
  }).toPass()
})

test('просмотр закрывается по Escape, клику вне и крестику', async ({ page }) => {
  await openLanding(page)
  const trigger = page.getByTestId('landing-shot-trigger-editor')
  const dialog = page.getByTestId('landing-shot-dialog')

  await trigger.click()
  await expect(dialog).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)

  await trigger.click()
  await expect(dialog).toBeVisible()
  await page.getByTestId('landing-shot-dialog-backdrop').click({ position: { x: 5, y: 5 } })
  await expect(dialog).toHaveCount(0)

  await trigger.click()
  await expect(dialog).toBeVisible()
  await page.getByTestId('landing-shot-dialog-close').click()
  await expect(dialog).toHaveCount(0)
})

test('просмотр доступен с клавиатуры', async ({ page }) => {
  await openLanding(page)
  await page.getByTestId('landing-shot-trigger-editor').focus()
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('landing-shot-dialog')).toBeVisible()

  await page.keyboard.press('Escape')
  await expect(page.getByTestId('landing-shot-dialog')).toHaveCount(0)
  await expect(async () => {
    const focused = await page.evaluate(() => document.activeElement?.getAttribute('data-testid'))
    expect(focused).toBe('landing-shot-trigger-editor')
  }).toPass()
})

test('кнопка Начать есть в лайтбоксе снимков на обоих языках', async ({ page }) => {
  await openLanding(page, 'ru')
  await page.getByTestId('landing-shot-trigger-editor').click()
  const cta = page.getByTestId('landing-shot-dialog-cta-editor')
  await expect(cta).toBeVisible()
  await expect(cta).toHaveText('Начать')
  await expect(cta).toHaveAttribute('href', /app\.endgrain\.app\/register/)
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('landing-shot-dialog')).toHaveCount(0)

  await page.getByTestId('landing-locale-en').click()
  await page.getByTestId('landing-shot-trigger-editor').click()
  await expect(cta).toBeVisible()
  await expect(cta).toHaveText('Start')
  await expect(cta).toHaveAttribute('href', /app\.endgrain\.app\/register/)
})

test('окно входа открывается из лайтбокса снимков', async ({ page }) => {
  await openLanding(page, 'ru')
  await page.getByTestId('landing-shot-trigger-editor').click()
  await page.getByTestId('landing-shot-dialog-cta-editor').click()
  await expect(page.getByTestId('landing-auth-dialog')).toBeVisible()
  await expect(page.getByTestId('auth-email')).toBeVisible()
})

test('подвал несёт дисклеймер Amazon и ссылки на правовые документы', async ({ page }) => {
  await openLanding(page)
  const footer = page.getByTestId('landing-footer')
  await expect(footer).toContainText('Amazon')
  await expect(footer.getByTestId('landing-footer-privacy')).toBeVisible()
  await expect(footer.getByTestId('landing-footer-consent-settings')).toBeVisible()
})

test('форма подписки требует согласие и валидирует адрес', async ({ page }) => {
  await openLanding(page)
  await page.getByTestId('subscribe-email').fill('stas@example.com')
  await page.getByTestId('subscribe-submit').click()
  await expect(page.getByTestId('subscribe-error')).toBeVisible()

  await page.getByTestId('subscribe-consent').check()
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
  await expect(page.getByTestId('home-view')).toBeVisible()
  await expect(page.getByTestId('landing')).toHaveCount(0)
})

test('витрина уважает prefers-reduced-motion', async ({ page }) => {
  await openLanding(page)
  const card = page.getByTestId('landing-pattern-marquee').locator('.eg-photo-card').first()
  await expect(card).toHaveCount(1)

  await page.emulateMedia({ reducedMotion: 'reduce' })
  await card.hover()
  await expect(async () => {
    const transform = await card.evaluate((el) => getComputedStyle(el).transform)
    expect(transform).toBe('none')
  }).toPass()

  const track = page.getByTestId('landing-marquee-row-a').locator('.eg-marquee-track')
  await expect(async () => {
    const name = await track.evaluate((el) => getComputedStyle(el).animationName)
    expect(name).toBe('none')
  }).toPass()
})

test('ленты едут в разные стороны', async ({ page }) => {
  await openLanding(page)
  // Курсор в стороне: под ним лента встаёт на паузу и animationName стал бы 'none'.
  await page.mouse.move(0, 0)

  const trackA = page.getByTestId('landing-marquee-row-a').locator('.eg-marquee-track')
  const trackB = page.getByTestId('landing-marquee-row-b').locator('.eg-marquee-track')
  for (const track of [trackA, trackB]) {
    const name = await track.evaluate((el) => getComputedStyle(el).animationName)
    expect(name).toBe('eg-marquee')
  }
  expect(await trackA.evaluate((el) => getComputedStyle(el).animationDirection)).toBe('normal')
  expect(await trackB.evaluate((el) => getComputedStyle(el).animationDirection)).toBe('reverse')

  // Замер сдвига по координатам сюда не идёт сознательно: за доступное тесту время
  // лента при цикле в минуту проезжает считаные пиксели, и на нагруженном CI проверка
  // мигала бы. Направление уже гарантировано animationDirection строкой выше.
})

test('клик по узору ведёт в студию', async ({ page }) => {
  await openLanding(page)
  await expect(page.getByTestId('landing-pattern-checkerboard-classic')).toHaveAttribute('href', /app\.endgrain\.app/)
})

test('логотип в шапке лендинга ведёт на главную', async ({ page }) => {
  await openLanding(page)
  const home = page.getByTestId('landing-home')
  await expect(home).toHaveAttribute('href', '/')
  await page.goto('/landing#shots')
  await home.click()
  await expect(page).toHaveURL(/\/(landing)?$/)
  await expect(page.getByTestId('landing')).toBeVisible()
})
