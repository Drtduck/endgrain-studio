import { expect, test, type Locator, type Page } from '@playwright/test'
import { presetConsent } from './helpers/consent'

/**
 * Вёрстка тарифов ломалась не логикой, а классами: длинный CTA («Оформить Pro:
 * от $7.50 в месяц») вылезал за border карточки, кнопки болтались на разной
 * высоте, карточки были разной высоты. Тесты ниже смотрят на геометрию, а не на
 * тексты: только так регресс вёрстки ловится автоматически.
 */

const CARDS = ['pricing-free', 'pricing-pass', 'pricing-pro', 'pricing-developer'] as const

const DESKTOP = { width: 1440, height: 900 }
const MOBILE = { width: 390, height: 844 }

/** Погрешность на субпиксельный рендер и тени: сравниваем не байт-в-байт. */
const EPS = 1

async function box(locator: Locator): Promise<{ x: number; y: number; width: number; height: number }> {
  const value = await locator.boundingBox()
  expect(value, 'элемент должен иметь размеры').not.toBeNull()
  return value as { x: number; y: number; width: number; height: number }
}

/** Content-box карточки: снаружи ещё border и padding, по ним и выравниваются дети. */
async function contentBox(card: Locator): Promise<{ width: number; bottom: number }> {
  const outer = await box(card)
  const insets = await card.evaluate((el) => {
    const cs = getComputedStyle(el)
    return {
      left: parseFloat(cs.paddingLeft) + parseFloat(cs.borderLeftWidth),
      right: parseFloat(cs.paddingRight) + parseFloat(cs.borderRightWidth),
      bottom: parseFloat(cs.paddingBottom) + parseFloat(cs.borderBottomWidth),
    }
  })
  return {
    width: outer.width - insets.left - insets.right,
    bottom: outer.y + outer.height - insets.bottom,
  }
}

/**
 * Каждая кнопка-CTA внутри карточки не выходит за её границы, занимает всю
 * ширину контента и умеет переносить текст. Последнее важнее всего: тексты CTA
 * вроде «Оформить Pro: от $7.50 в месяц» видны только вошедшему человеку, а без
 * ключей кассы в CI рендерятся короткие. Проверка whitespace ловит регресс
 * (базовый Button - whitespace-nowrap) на любой кнопке, независимо от текста.
 */
async function expectCtasInsideCards(page: Page): Promise<void> {
  let checked = 0

  for (const testId of CARDS) {
    const card = page.getByTestId(testId)
    if ((await card.count()) === 0) continue

    const cardBox = await box(card)
    const inner = await contentBox(card)
    // Без ключей кассы вместо кнопок стоит честная плашка «оплата выключена»:
    // её геометрия важна ровно так же, это тот же нижний блок карточки.
    const ctas = card.locator('[data-slot="button"], [data-testid$="-disabled"]')
    const total = await ctas.count()

    for (let i = 0; i < total; i += 1) {
      const cta = ctas.nth(i)
      const ctaBox = await box(cta)
      const where = `${testId} / CTA #${i}`

      expect(ctaBox.x, `${where}: левый край`).toBeGreaterThanOrEqual(cardBox.x - EPS)
      expect(ctaBox.y, `${where}: верхний край`).toBeGreaterThanOrEqual(cardBox.y - EPS)
      expect(ctaBox.x + ctaBox.width, `${where}: правый край`).toBeLessThanOrEqual(cardBox.x + cardBox.width + EPS)
      expect(ctaBox.y + ctaBox.height, `${where}: нижний край`).toBeLessThanOrEqual(cardBox.y + cardBox.height + EPS)

      const whiteSpace = await cta.evaluate((el) => getComputedStyle(el).whiteSpace)
      expect(whiteSpace, `${where}: длинный текст обязан переноситься`).not.toBe('nowrap')

      expect(ctaBox.width, `${where}: кнопка во всю ширину контента карточки`).toBeCloseTo(inner.width, 0)

      checked += 1
    }
  }

  expect(checked, 'хотя бы одна CTA-кнопка должна быть на странице').toBeGreaterThan(0)
}

/**
 * Список фич тянется, CTA прижат к низу: иначе кнопки в соседних карточках
 * болтаются на разной высоте, как было на скрине.
 */
async function expectCtaPinnedToBottom(page: Page): Promise<void> {
  for (const testId of CARDS) {
    const card = page.getByTestId(testId)
    if ((await card.count()) === 0) continue

    const inner = await contentBox(card)
    const lastBox = await box(card.locator(':scope > *').last())

    expect(lastBox.y + lastBox.height, `${testId}: нижний блок карточки должен стоять у её низа`).toBeCloseTo(
      inner.bottom,
      0
    )
  }
}

async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
  }))
  expect(overflow.scroll, 'страница не должна скроллиться вбок').toBeLessThanOrEqual(overflow.client + 1)
}

/** На lg карточки стоят в один ряд и обязаны быть одной высоты. */
async function expectEqualCardHeights(page: Page): Promise<void> {
  const heights: number[] = []
  const tops: number[] = []
  for (const testId of CARDS) {
    const card = page.getByTestId(testId)
    if ((await card.count()) === 0) continue
    const cardBox = await box(card)
    heights.push(cardBox.height)
    tops.push(cardBox.y)
  }
  // Карточка Пропуска скрыта, пока в кассе нет её цены (в CI ключей нет вовсе),
  // поэтому проверяем все отрисованные карточки, а не жёстко четыре.
  expect(heights.length, 'на странице должны быть карточки тарифов').toBeGreaterThanOrEqual(3)

  const first = tops[0] as number
  for (const top of tops) expect(Math.abs(top - first), 'карточки должны стоять одним рядом').toBeLessThanOrEqual(EPS)

  const tallest = Math.max(...heights)
  const shortest = Math.min(...heights)
  expect(tallest - shortest, 'карточки должны быть одной высоты').toBeLessThanOrEqual(EPS)
}

test.beforeEach(async ({ page }) => {
  await presetConsent(page)
})

for (const path of ['/pricing', '/landing']) {
  test.describe(`вёрстка тарифов ${path}`, () => {
    test('1440x900: карточки одной высоты, кнопки внутри карточек, без бокового скролла', async ({ page }) => {
      await page.setViewportSize(DESKTOP)
      await page.goto(path)
      await expect(page.getByTestId('pricing-plans').first()).toBeVisible()

      await expectEqualCardHeights(page)
      await expectCtasInsideCards(page)
      await expectCtaPinnedToBottom(page)
      await expectNoHorizontalOverflow(page)
    })

    test('390x844: кнопки внутри карточек, без бокового скролла', async ({ page }) => {
      await page.setViewportSize(MOBILE)
      await page.goto(path)
      await expect(page.getByTestId('pricing-plans').first()).toBeVisible()

      await expectCtasInsideCards(page)
      await expectCtaPinnedToBottom(page)
      await expectNoHorizontalOverflow(page)
    })
  })
}
