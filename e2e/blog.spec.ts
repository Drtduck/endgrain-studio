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

test('rss.xml парсится как XML и содержит три item', async ({ request }) => {
  const response = await request.get('/blog/rss.xml')
  expect(response.ok()).toBe(true)
  expect(response.headers()['content-type']).toContain('application/rss+xml')
  const xml = await response.text()
  expect(xml).toContain('<rss version="2.0">')
  expect((xml.match(/<item>/g) ?? []).length).toBe(3)
})

test('несуществующий slug статьи отдаёт 404', async ({ page }) => {
  const response = await page.goto('/blog/net-takoy-stati')
  expect(response?.status()).toBe(404)
})
