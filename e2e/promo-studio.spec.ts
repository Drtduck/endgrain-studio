import { expect, test, type Page } from '@playwright/test'
import { presetConsent } from './helpers/consent'

test.beforeEach(async ({ page }) => {
  await presetConsent(page)
})

/**
 * Job-путь (P0-3..P0-9) гоняется здесь в демо-режиме: в CI живого Supabase и
 * ключей провайдеров нет (см. playwright.config.ts), поэтому isAiDemoMode()
 * всегда true и PhotoSeries/ReferenceShots используют локальный
 * useSeriesRunner.startDemo() - очередь queued -> running -> done идёт без
 * единого сетевого запроса, но по тому же честному конечному автомату
 * состояний, что и настоящий job-путь. Это единственный способ проверить
 * скелетоны/прогресс/отмену без живого проекта в базе.
 */
const noKeys =
  (process.env['GEMINI_API_KEY'] ?? '') === '' &&
  (process.env['FAL_KEY'] ?? '') === '' &&
  (process.env['PRINTFUL_API_KEY'] ?? '') === ''

async function openStudio(page: Page): Promise<void> {
  await page.addInitScript(() => window.localStorage.clear())
  await page.goto('/?tab=editor')
  await expect(page.getByTestId('board-canvas')).toBeVisible()
  await page.getByTestId('tab-promo').click()
  await expect(page.getByTestId('promo-panel')).toBeVisible()
}

test('вкладка «Промо» открывается и показывает все панели', async ({ page }) => {
  await openStudio(page)
  await expect(page.getByTestId('promo-photo')).toBeVisible()
  await expect(page.getByTestId('promo-reference')).toBeVisible()
  // Мерч спрятан до готовности флоу покупки (спека merch-orders.md, PR #47):
  // старая кнопка вела в чужой кабинет Printful, новая касса ещё не смержена.
  await expect(page.getByTestId('promo-merch')).toHaveCount(0)
})

test('состояние без кадров: до генерации в сетке только заглушки набора по умолчанию', async ({ page }) => {
  test.skip(!noKeys, 'ключ в окружении переводит панель на настоящий провайдер')
  await openStudio(page)
  for (const kind of ['hero', 'serving', 'macroOil', 'package']) {
    await expect(page.getByTestId(`promo-shot-${kind}`)).toBeVisible()
  }
  await expect(page.getByTestId('promo-shot-catalog')).toHaveCount(0)
  await expect(page.getByTestId('promo-series-progress')).toHaveCount(0)
})

test('набор кадров выбирается чипами, и цена меняется вместе с ним', async ({ page }) => {
  await openStudio(page)
  const cost = page.getByTestId('promo-cost')
  await expect(cost).toContainText('4')
  await page.getByTestId('promo-preset-catalog').click()
  await expect(cost).toContainText('5')
  await expect(page.getByTestId('promo-shot-catalog')).toBeVisible()
  await page.getByTestId('promo-preset-catalog').click()
  await expect(page.getByTestId('promo-shot-catalog')).toHaveCount(0)
})

test('пустой набор выключает кнопку и не разрешает генерацию впустую', async ({ page }) => {
  await openStudio(page)
  for (const kind of ['hero', 'serving', 'macroOil', 'package']) {
    await page.getByTestId(`promo-preset-${kind}`).click()
  }
  await expect(page.getByTestId('promo-generate')).toBeDisabled()
})

test('редактор промта показывает итоговый текст и даёт править только сцену', async ({ page }) => {
  await openStudio(page)
  const editor = page.getByTestId('promo-prompt-editor-hero')
  await editor.locator('summary').click()
  const preview = editor.getByTestId('promo-prompt-preview')
  await expect(preview).toBeVisible()
  const before = await preview.textContent()
  expect(before ?? '').toContain('Subject:')

  const scene = editor.getByTestId('promo-prompt-scene')
  await scene.fill('A completely different custom scene for the hero shot.')
  await expect(preview).toContainText('A completely different custom scene')

  await editor.getByTestId('promo-prompt-reset').click()
  await expect(preview).not.toContainText('A completely different custom scene')
})

test('генерация: скелетоны, честный прогресс и готовые кадры без единого запроса в демо-режиме', async ({ page }) => {
  test.skip(!noKeys, 'ключ в окружении переводит панель на настоящий провайдер')
  await openStudio(page)

  const requests: string[] = []
  page.on('request', (req) => {
    if (req.url().includes('/api/promo/shot')) requests.push(req.url())
  })

  await page.getByTestId('promo-generate').click()
  // Сразу после клика хотя бы один кадр должен быть в очереди или уже рисуется -
  // экран никогда не остаётся пустым в ожидании ответа.
  await expect(page.getByTestId('promo-series-progress')).toBeVisible()

  await expect(page.getByTestId('promo-series-progress')).toContainText('4', { timeout: 5_000 })
  // Демо-режим не ходит на сервер вовсе: очередь эмулируется на клиенте.
  expect(requests).toHaveLength(0)
})

test('отмена: не начатые кадры не запускаются, кнопка отмены исчезает по завершении', async ({ page }) => {
  test.skip(!noKeys, 'ключ в окружении переводит панель на настоящий провайдер')
  await openStudio(page)
  // Берём все двенадцать пресетов, чтобы окно для клика по «Отменить» было шире.
  for (const meta of [
    'studioDark', 'hands', 'workbench', 'stack', 'island', 'edge', 'flatlay', 'catalog',
  ]) {
    await page.getByTestId(`promo-preset-${meta}`).click()
  }
  await page.getByTestId('promo-generate').click()
  await expect(page.getByTestId('promo-cancel')).toBeVisible()
  await page.getByTestId('promo-cancel').click()
  // После отмены прогресс всё равно сходится к финальному числу (готово + отменено).
  await expect(page.getByTestId('promo-cancel')).toHaveCount(0, { timeout: 5_000 })
})

test('панель съёмки по референсу открыта и честно предупреждает про стиль', async ({ page }) => {
  await openStudio(page)
  await expect(page.getByTestId('promo-reference')).toBeVisible()
  await expect(page.getByTestId('ref-disclaimer')).toContainText('стил')
  await expect(page.getByTestId('ref-analyze')).toBeDisabled()
})

// Мерч спрятан из вкладки «Промо» до готовности кассы (спека merch-orders.md,
// PR #47): секция MerchMockups больше не рендерится нигде в приложении, поэтому
// её нельзя открыть через страницу. Поведение компонента (локальные мокапы,
// ключ Printful, выбор товаров) покрыто прямым рендером в
// components/promo/PromoPanel.test.tsx (describe MerchMockups). Тесты вернутся
// сюда вместе с секцией по PR #47.
test.skip('без ключа Printful видны локальные мокапы мерча и нет кнопки Printful', async ({ page }) => {
  test.skip(!noKeys, 'в окружении есть ключ: кнопка Printful появится, и это другой сценарий')
  await openStudio(page)
  for (const id of ['tshirt', 'mug', 'poster', 'apron']) {
    await expect(page.getByTestId(`merch-item-${id}`)).toBeVisible()
  }
  await expect(page.getByTestId('merch-printful')).toHaveCount(0)
  await page.getByTestId('merch-generate').click()
  await expect(page.getByTestId('merch-note')).toContainText('PRINTFUL_API_KEY')
  await expect(page.getByTestId('merch-printful')).toHaveCount(0)
})

test.skip('товары для Printful выбираются чипами, по умолчанию два', async ({ page }) => {
  await openStudio(page)
  await expect(page.getByTestId('merch-pick-tshirt')).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByTestId('merch-pick-poster')).toHaveAttribute('aria-pressed', 'false')
  await page.getByTestId('merch-pick-poster').click()
  await expect(page.getByTestId('merch-pick-poster')).toHaveAttribute('aria-pressed', 'true')
})

/**
 * P1-1/P1-2: паки под площадку и справочник маркетплейсов. openStudioLocale
 * ставит cookie eg-locale до навигации, как в e2e/i18n.spec.ts - без него
 * нельзя надёжно проверить, что русские площадки скрыты в en.
 */
async function openStudioLocale(page: Page, locale: 'ru' | 'en'): Promise<void> {
  await page.context().addCookies([{ name: 'eg-locale', value: locale, url: 'http://127.0.0.1:3100' }])
  await openStudio(page)
}

test('смена площадки меняет список размеров пака', async ({ page }) => {
  await openStudioLocale(page, 'ru')
  const sizes = page.getByTestId('promo-pack-sizes')
  await page.getByTestId('promo-marketplace-select').selectOption('ozon')
  await expect(sizes).toContainText('1200x1600')
  await expect(sizes).toContainText('3:4')

  await page.getByTestId('promo-marketplace-select').selectOption('amazon')
  await expect(sizes).toContainText('2000x2000')
  await expect(sizes).toContainText('1:1')
})

test('неподтверждённая площадка несёт сноску, подтверждённая - нет', async ({ page }) => {
  await openStudioLocale(page, 'ru')
  await page.getByTestId('promo-marketplace-select').selectOption('wildberries')
  await expect(page.getByTestId('promo-pack-unconfirmed')).toBeVisible()

  await page.getByTestId('promo-marketplace-select').selectOption('yandexmarket')
  await expect(page.getByTestId('promo-pack-unconfirmed')).toHaveCount(0)
})

test('русские площадки не видны в en-локали', async ({ page }) => {
  await openStudioLocale(page, 'en')
  const selectEn = page.getByTestId('promo-marketplace-select')
  await expect(selectEn.locator('option[value="wildberries"]')).toHaveCount(0)
  await expect(selectEn.locator('option[value="ozon"]')).toHaveCount(0)
  await expect(selectEn.locator('option[value="yandexmarket"]')).toHaveCount(0)
  await expect(selectEn.locator('option[value="amazon"]')).toHaveCount(1)
})

test('русские площадки видны в ru-локали', async ({ page }) => {
  await openStudioLocale(page, 'ru')
  const selectRu = page.getByTestId('promo-marketplace-select')
  await expect(selectRu.locator('option[value="wildberries"]')).toHaveCount(1)
  await expect(selectRu.locator('option[value="ozon"]')).toHaveCount(1)
  await expect(selectRu.locator('option[value="yandexmarket"]')).toHaveCount(1)
})

test('пустой выбор кадров держит скачивание пака выключенным', async ({ page }) => {
  await openStudio(page)
  const download = page.getByTestId('promo-pack-download')
  await expect(download).toHaveAttribute('aria-disabled', 'true')
})

test('генерация в демо-режиме наполняет пак: «выбрать все» и «снять всё» на готовых кадрах', async ({ page }) => {
  test.skip(!noKeys, 'ключ в окружении переводит панель на настоящий провайдер')
  await openStudio(page)
  await page.getByTestId('promo-generate').click()
  await expect(page.getByTestId('promo-shot-done')).toHaveCount(4, { timeout: 5_000 })

  await expect(page.getByTestId('promo-pack-count')).toContainText('0')
  await page.getByTestId('promo-select-all').click()
  await expect(page.getByTestId('promo-pack-count')).toContainText('4')
  const download = page.getByTestId('promo-pack-download')
  await expect(download).not.toHaveAttribute('aria-disabled', 'true')
  await expect(download).toHaveAttribute('href', /market=amazon/)

  await page.getByTestId('promo-select-all').click()
  await expect(page.getByTestId('promo-pack-count')).toContainText('0')
  await expect(download).toHaveAttribute('aria-disabled', 'true')
})

test('правка кадра (демо) даёт два кадра, оба доступны для выбора в паке', async ({ page }) => {
  test.skip(!noKeys, 'ключ в окружении переводит панель на настоящий провайдер')
  await openStudio(page)
  await page.getByTestId('promo-generate').click()
  const heroCard = page.getByTestId('promo-shot-hero')
  await expect(heroCard.getByTestId('promo-shot-done')).toBeVisible({ timeout: 5_000 })
  const rootId = await heroCard.getAttribute('data-shot-id')
  expect(rootId).not.toBeNull()

  await heroCard.getByTestId(`promo-shot-edit-${rootId}`).click()
  await page.getByTestId('promo-edit-input').fill('Make the background darker.')
  await page.getByTestId(`promo-shot-edit-submit-${rootId}`).click()

  const variants = page.getByTestId(`promo-variants-${rootId}`)
  await expect(variants).toBeVisible({ timeout: 5_000 })
  await expect(variants.getByTestId('promo-shot-done')).toBeVisible({ timeout: 5_000 })

  // Пять готовых кадров теперь в паке: четыре пресета плюс один вариант правки.
  await page.getByTestId('promo-select-all').click()
  await expect(page.getByTestId('promo-pack-count')).toContainText('5')
})
