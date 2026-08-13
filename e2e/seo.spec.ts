import { expect, test } from '@playwright/test'

test('/llms.txt отдаётся как text/plain и начинается по спеке llmstxt.org', async ({ request }) => {
  const response = await request.get('/llms.txt')
  expect(response.ok()).toBe(true)
  expect(response.headers()['content-type']).toContain('text/plain')
  const text = await response.text()
  const lines = text.split('\n')
  expect(lines[0]).toBe('# Endgrain Studio')
  const secondNonEmpty = lines.slice(1).find((l) => l.trim().length > 0)
  expect(secondNonEmpty?.startsWith('>')).toBe(true)
})

test('/sitemap.xml содержит URL всех трёх статей', async ({ request }) => {
  const response = await request.get('/sitemap.xml')
  expect(response.ok()).toBe(true)
  const xml = await response.text()
  expect(xml).toContain('https://endgrain.app/blog/kerf-i-pripuski')
  expect(xml).toContain('https://endgrain.app/blog/vybor-porod')
  expect(xml).toContain('https://endgrain.app/blog/shema-perekleyki')
})

test('/robots.txt закрывает /api/ и ссылается на sitemap', async ({ request }) => {
  const response = await request.get('/robots.txt')
  expect(response.ok()).toBe(true)
  const txt = await response.text()
  expect(txt).toContain('Disallow: /api/')
  expect(txt).toContain('Sitemap: https://endgrain.app/sitemap.xml')
})

test('лендинг несёт @graph JSON-LD с Organization, WebSite и SoftwareApplication', async ({ page }) => {
  await page.goto('/landing')
  const script = page.locator('script[type="application/ld+json"]').first()
  const raw = await script.textContent()
  const json = JSON.parse(raw ?? '{}') as { '@graph': Array<Record<string, unknown>> }
  const types = json['@graph'].map((node) => node['@type'])
  expect(types).toEqual(['Organization', 'WebSite', 'SoftwareApplication'])
})

test('канон лендинга указывает на корень endgrain.app', async ({ page }) => {
  await page.goto('/landing')
  const canonical = page.locator('link[rel="canonical"]')
  // Next сам нормализует корневой канон без слеша на конце (result.origin
  // в resolveAbsoluteUrlWithPathname). sitemap.xml (SITE_ORIGIN) и llms.txt (siteUrl())
  // пишут корень так же, без слеша - все три источника согласованы буквально, не просто
  // "по смыслу".
  await expect(canonical).toHaveAttribute('href', 'https://endgrain.app')
})

test('лента блога ссылается на RSS через link rel=alternate', async ({ page }) => {
  await page.goto('/blog')
  const alternate = page.locator('link[rel="alternate"][type="application/rss+xml"]')
  await expect(alternate).toHaveAttribute('href', 'https://endgrain.app/blog/rss.xml')
})

test('подвал лендинга ссылается на блог', async ({ page }) => {
  await page.goto('/landing')
  await expect(page.getByTestId('landing-footer-blog')).toHaveAttribute('href', '/blog')
})

test('шапка лендинга ссылается на блог', async ({ page }) => {
  await page.goto('/landing')
  await expect(page.getByTestId('landing-header-blog')).toHaveAttribute('href', '/blog')
})

test('шапка студии ссылается на блог лендинга', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('app-blog-link')).toHaveAttribute('href', 'https://endgrain.app/blog')
})
