import { expect, test } from '@playwright/test'

// Хост 127.0.0.1 это роль unknown (см. lib/routing/host.ts): домены не разводятся,
// /blog открывается напрямую без редиректа на app.endgrain.app.

test('лента блога открывается без логина и показывает три карточки', async ({ page }) => {
  await page.goto('/blog')
  const cards = page.getByTestId('blog-post-card')
  await expect(cards).toHaveCount(3)
  for (const card of await cards.all()) {
    await expect(card.locator('h2')).not.toBeEmpty()
    await expect(card.locator('time').first()).not.toBeEmpty()
  }
})

test('лента блога на английской локали показывает английские версии статей', async ({ page }) => {
  await page.context().addCookies([{ name: 'eg-locale', value: 'en', url: 'http://127.0.0.1:3100' }])
  await page.goto('/blog')
  const cards = page.getByTestId('blog-post-card')
  await expect(cards).toHaveCount(3)
  // Ни одна карточка не помечена бейджем «на другом языке»: для всех трёх тем
  // нашёлся английский перевод, оригиналы на русском в ленту не попадают.
  await expect(page.getByTestId('blog-post-card-lang-badge')).toHaveCount(0)
})

test('на статье с переводом есть двусторонняя ссылка «читать на другом языке»', async ({ page }) => {
  await page.goto('/blog/kerf-i-pripuski')
  const link = page.getByTestId('blog-translation-link')
  await expect(link).toBeVisible()
  await expect(link).toHaveAttribute('href', '/blog/kerf-i-pripuski-en')

  await link.click()
  await expect(page).toHaveURL(/\/blog\/kerf-i-pripuski-en$/)
  const back = page.getByTestId('blog-translation-link')
  await expect(back).toHaveAttribute('href', '/blog/kerf-i-pripuski')
})

test('hreflang-alternate статьи указывает на пару языков', async ({ page }) => {
  await page.goto('/blog/kerf-i-pripuski')
  await expect(page.locator('link[rel="alternate"][hreflang="en"]')).toHaveAttribute(
    'href',
    'https://endgrain.app/blog/kerf-i-pripuski-en',
  )
})

test('переход по карточке ведёт на статью с H1, блоком-ответом, хлебными крошками и датой обновления', async ({
  page,
}) => {
  await page.goto('/blog')
  await page.getByTestId('blog-post-card').first().locator('h2 a').click()
  await expect(page).toHaveURL(/\/blog\/[a-z-]+$/)

  await expect(page.getByRole('heading', { level: 1 })).not.toBeEmpty()
  await expect(page.getByTestId('blog-answer')).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'breadcrumb' })).toBeVisible()
  await expect(page.getByTestId('blog-post-updated')).toBeVisible()
})

test('на статье ровно один JSON-LD со связкой BlogPosting', async ({ page }) => {
  await page.goto('/blog/kerf-i-pripuski')
  const scripts = page.locator('script[type="application/ld+json"]')
  await expect(scripts).toHaveCount(1)

  const raw = await scripts.first().textContent()
  const json = JSON.parse(raw ?? '{}') as { '@graph': Array<Record<string, unknown>> }
  const posting = json['@graph'].find((node) => node['@type'] === 'BlogPosting')
  expect(posting).toBeDefined()
  expect(posting?.['headline']).toBeTruthy()
  expect(posting?.['datePublished']).toBeTruthy()
  expect(posting?.['image']).toMatch(/^https?:\/\//)
})

test('канон статьи указывает на endgrain.app/blog/<slug>', async ({ page }) => {
  await page.goto('/blog/kerf-i-pripuski')
  const canonical = page.locator('link[rel="canonical"]')
  await expect(canonical).toHaveAttribute('href', 'https://endgrain.app/blog/kerf-i-pripuski')
})

test('страница тега отдаёт подмножество статей и стоит noindex', async ({ page }) => {
  await page.goto('/blog/tag/раскрой')
  await expect(page.getByTestId('blog-tag-feed')).toBeVisible()
  const cards = page.getByTestId('blog-post-card')
  const count = await cards.count()
  expect(count).toBeGreaterThan(0)
  expect(count).toBeLessThan(3)
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/)
})

test('rss.xml парсится как XML и содержит все статьи, ru и en вместе', async ({ request }) => {
  const response = await request.get('/blog/rss.xml')
  expect(response.ok()).toBe(true)
  expect(response.headers()['content-type']).toContain('application/rss+xml')
  const xml = await response.text()
  expect(xml).toContain('<rss version="2.0">')
  // Фид отдаёт все статьи разом (обе локали): у него нет читателя с локалью,
  // а лента /blog фильтрует по языку только в интерфейсе.
  expect((xml.match(/<item>/g) ?? []).length).toBe(6)
})

test('несуществующий slug статьи отдаёт 404', async ({ page }) => {
  const response = await page.goto('/blog/net-takoy-stati')
  expect(response?.status()).toBe(404)
})
