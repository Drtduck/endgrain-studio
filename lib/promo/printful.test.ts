import { describe, expect, it, vi } from 'vitest'
import {
  PRINTFUL_POLL_ATTEMPTS,
  createMockupTask,
  createTaskBody,
  generateMockup,
  pollMockupTask,
  printfulHeaders,
  readMockupTask,
  type PrintfulAuth,
} from './printful'
import { PRINTFUL_PLACEMENTS, centeredSquare } from './printfulCatalog'
import { MERCH_PRODUCTS } from './types'

const AUTH: PrintfulAuth = { apiKey: 'secret-key', storeId: '4242' }
const NO_STORE: PrintfulAuth = { apiKey: 'secret-key', storeId: '' }
const nap = (): Promise<void> => Promise.resolve()

function res(body: unknown, ok = true, status = 200): Response {
  return { ok, status, json: () => Promise.resolve(body) } as unknown as Response
}

describe('каталог Printful', () => {
  it('у каждого товара мерча есть координаты в каталоге', () => {
    for (const product of MERCH_PRODUCTS) {
      const place = PRINTFUL_PLACEMENTS[product.id]
      expect(place.productId).toBeGreaterThan(0)
      expect(place.variantId).toBeGreaterThan(0)
      expect(place.placement).not.toBe('')
      expect(place.areaWidthPx).toBeGreaterThan(0)
      expect(place.areaHeightPx).toBeGreaterThan(0)
    }
  })

  it('квадрат узора вписан в область печати и отцентрован', () => {
    for (const product of MERCH_PRODUCTS) {
      const place = PRINTFUL_PLACEMENTS[product.id]
      const pos = centeredSquare(place)
      // Квадрат, иначе шашка поедет в ромб.
      expect(pos.width).toBe(pos.height)
      expect(pos.width).toBe(Math.min(place.areaWidthPx, place.areaHeightPx))
      // Целиком внутри области: Printful обрежет то, что вылезло.
      expect(pos.left).toBeGreaterThanOrEqual(0)
      expect(pos.top).toBeGreaterThanOrEqual(0)
      expect(pos.left + pos.width).toBeLessThanOrEqual(place.areaWidthPx)
      expect(pos.top + pos.height).toBeLessThanOrEqual(place.areaHeightPx)
    }
  })

  it('фартук это фартук, а не носки: id 186 в каталоге давно другой товар', () => {
    // Ровно та ошибка, ради которой id сверялись с живым каталогом.
    expect(PRINTFUL_PLACEMENTS.apron.productId).toBe(894)
    expect(PRINTFUL_PLACEMENTS.apron.productId).not.toBe(186)
  })
})

describe('заголовки и тело запроса', () => {
  it('ключ уезжает заголовком Authorization, id магазина отдельным заголовком', () => {
    const headers = printfulHeaders(AUTH)
    expect(headers['Authorization']).toBe('Bearer secret-key')
    expect(headers['X-PF-Store-Id']).toBe('4242')
  })

  it('без id магазина заголовка нет вовсе: токен уровня магазина его не терпит', () => {
    expect(printfulHeaders(NO_STORE)['X-PF-Store-Id']).toBeUndefined()
  })

  it('тело задачи несёт вариант, формат и публичную ссылку на макет', () => {
    const body = createTaskBody('mug', 'https://cdn.example/a.png')
    expect(body.variant_ids).toEqual([PRINTFUL_PLACEMENTS.mug.variantId])
    expect(body.format).toBe('jpg')
    expect(body.files[0]?.image_url).toBe('https://cdn.example/a.png')
    expect(body.files[0]?.placement).toBe(PRINTFUL_PLACEMENTS.mug.placement)
  })
})

describe('создание задачи', () => {
  it('возвращает task_key и бьёт по адресу товара', async () => {
    const fetchMock = vi.fn().mockResolvedValue(res({ result: { task_key: 'abc' } }))
    const out = await createMockupTask('tshirt', 'https://cdn/a.png', AUTH, fetchMock)
    expect(out).toEqual({ ok: true, value: 'abc' })
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain(`/create-task/${PRINTFUL_PLACEMENTS.tshirt.productId}`)
  })

  it('нехватка магазина отделяется от прочих бед', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const fetchMock = vi.fn().mockResolvedValue(
      res({ error: { message: 'This endpoint requires `store_id`!' } }, false, 400),
    )
    expect(await createMockupTask('mug', 'https://cdn/a.png', AUTH, fetchMock)).toEqual({ ok: false, error: 'store' })
  })

  it('битый ключ это auth, а не общий сбой', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const fetchMock = vi.fn().mockResolvedValue(res({ error: { message: 'Unauthorized' } }, false, 401))
    expect(await createMockupTask('mug', 'https://cdn/a.png', AUTH, fetchMock)).toEqual({ ok: false, error: 'auth' })
  })

  it('ответ 200 без task_key не выдаётся за успех', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const fetchMock = vi.fn().mockResolvedValue(res({ result: {} }))
    expect(await createMockupTask('mug', 'https://cdn/a.png', AUTH, fetchMock)).toEqual({ ok: false, error: 'failed' })
  })

  it('обрыв сети не выбрасывает исключение наружу', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const fetchMock = vi.fn().mockRejectedValue(new Error('network down'))
    expect(await createMockupTask('mug', 'https://cdn/a.png', AUTH, fetchMock)).toEqual({ ok: false, error: 'failed' })
  })
})

describe('поллинг задачи', () => {
  it('pending это не ошибка и не результат', async () => {
    const fetchMock = vi.fn().mockResolvedValue(res({ result: { status: 'pending' } }))
    expect(await readMockupTask('k', AUTH, fetchMock)).toBe('pending')
  })

  it('дожидается готового мокапа и отдаёт ссылку', async () => {
    let call = 0
    const fetchMock = vi.fn().mockImplementation(() => {
      call += 1
      return Promise.resolve(
        call < 3
          ? res({ result: { status: 'pending' } })
          : res({ result: { status: 'completed', mockups: [{ mockup_url: 'https://p/m.jpg' }] } }),
      )
    })
    expect(await pollMockupTask('k', AUTH, fetchMock, nap)).toEqual({ ok: true, value: 'https://p/m.jpg' })
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('вечный pending упирается в потолок попыток, а не крутится бесконечно', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const fetchMock = vi.fn().mockResolvedValue(res({ result: { status: 'pending' } }))
    expect(await pollMockupTask('k', AUTH, fetchMock, nap)).toEqual({ ok: false, error: 'timeout' })
    expect(fetchMock).toHaveBeenCalledTimes(PRINTFUL_POLL_ATTEMPTS)
  })

  it('отбитый макет отличается от сетевого сбоя: лечится другим узором', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const fetchMock = vi.fn().mockResolvedValue(res({ result: { status: 'failed', error: 'bad file' } }))
    expect(await pollMockupTask('k', AUTH, fetchMock, nap)).toEqual({ ok: false, error: 'rejected' })
  })

  it('completed без ссылки не выдаётся за мокап', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const fetchMock = vi.fn().mockResolvedValue(res({ result: { status: 'completed', mockups: [] } }))
    expect(await pollMockupTask('k', AUTH, fetchMock, nap)).toEqual({ ok: false, error: 'failed' })
  })
})

describe('полный путь одного товара', () => {
  it('создаёт задачу, дожидается и отдаёт мокап', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) =>
      Promise.resolve(
        String(url).includes('create-task')
          ? res({ result: { task_key: 'k' } })
          : res({ result: { status: 'completed', mockups: [{ mockup_url: 'https://p/x.jpg' }] } }),
      ),
    )
    expect(await generateMockup('poster', 'https://cdn/a.png', AUTH, fetchMock, nap)).toEqual({
      ok: true,
      value: { id: 'poster', url: 'https://p/x.jpg' },
    })
  })

  it('провал создания задачи не идёт опрашивать несуществующий ключ', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const fetchMock = vi.fn().mockResolvedValue(res({ error: { message: 'Unauthorized' } }, false, 403))
    expect(await generateMockup('poster', 'https://cdn/a.png', AUTH, fetchMock, nap)).toEqual({
      ok: false,
      error: 'auth',
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('ни в один адрес запроса не попадает ключ', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) =>
      Promise.resolve(
        String(url).includes('create-task')
          ? res({ result: { task_key: 'k' } })
          : res({ result: { status: 'completed', mockups: [{ mockup_url: 'https://p/x.jpg' }] } }),
      ),
    )
    await generateMockup('apron', 'https://cdn/a.png', AUTH, fetchMock, nap)
    for (const call of fetchMock.mock.calls) expect(String(call[0])).not.toContain('secret-key')
  })
})
