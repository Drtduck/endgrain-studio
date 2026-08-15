import { describe, expect, it } from 'vitest'
import {
  AI_CREDIT_FEATURES,
  AI_FEATURE_COST,
  AI_MONTHLY_LIMIT,
  AI_TRIAL_FEATURES,
  FREE_TRIAL_IP_LIMIT,
  FREE_TRIAL_LIMIT,
  FREE_TRIAL_MAX_UNITS,
  aiAccess,
  aiPeriod,
  aiRemaining,
} from './quota'

describe('aiPeriod', () => {
  it('даёт календарный месяц в формате YYYY-MM', () => {
    expect(aiPeriod(Date.parse('2026-08-12T12:00:00.000Z'))).toBe('2026-08')
  })

  it('первая и последняя секунды месяца лежат в одном периоде', () => {
    expect(aiPeriod(Date.parse('2026-08-01T00:00:00.000Z'))).toBe('2026-08')
    expect(aiPeriod(Date.parse('2026-08-31T23:59:59.999Z'))).toBe('2026-08')
  })

  it('на границе месяца период меняется, то есть квота обнуляется первого числа', () => {
    expect(aiPeriod(Date.parse('2026-08-31T23:59:59.999Z'))).not.toBe(
      aiPeriod(Date.parse('2026-09-01T00:00:00.000Z')),
    )
    expect(aiPeriod(Date.parse('2026-09-01T00:00:00.000Z'))).toBe('2026-09')
  })

  it('декабрь переходит в январь следующего года', () => {
    expect(aiPeriod(Date.parse('2026-12-31T23:59:59.000Z'))).toBe('2026-12')
    expect(aiPeriod(Date.parse('2027-01-01T00:00:01.000Z'))).toBe('2027-01')
  })

  it('считает по UTC, а не по зоне инстанса: у Vercel она не гарантирована', () => {
    // Полночь 1 сентября по UTC это ещё 31 августа в Нью-Йорке, но период уже новый.
    expect(aiPeriod(Date.parse('2026-09-01T00:30:00.000Z'))).toBe('2026-09')
  })

  it('формат совпадает с check-констрейнтом таблицы ai_usage', () => {
    expect(aiPeriod(Date.parse('2026-01-09T00:00:00.000Z'))).toMatch(/^[0-9]{4}-[0-9]{2}$/)
  })
})

describe('aiRemaining', () => {
  it('пустой счётчик даёт весь лимит', () => {
    expect(aiRemaining(0)).toBe(AI_MONTHLY_LIMIT)
  })

  it('арифметика простая: тридцать минус потраченное', () => {
    expect(aiRemaining(1)).toBe(29)
    expect(aiRemaining(29)).toBe(1)
  })

  it('выбранная квота даёт ноль, а не отрицательное число', () => {
    expect(aiRemaining(30)).toBe(0)
    expect(aiRemaining(45)).toBe(0)
  })

  it('испорченная строка в базе не рисует остаток больше лимита', () => {
    expect(aiRemaining(-5)).toBe(AI_MONTHLY_LIMIT)
  })
})

describe('aiAccess', () => {
  it('собирает состояние для интерфейса с остатком и тиром pro', () => {
    expect(aiAccess('pro', 4)).toEqual({
      state: 'pro',
      limit: 30,
      used: 4,
      freeRemaining: 26,
      credits: 0,
      remaining: 26,
      tier: 'pro',
    })
  })

  it('состояния без счётчика показывают полный лимит и тир null', () => {
    expect(aiAccess('anonymous')).toEqual({
      state: 'anonymous',
      limit: 30,
      used: 0,
      freeRemaining: 30,
      credits: 0,
      remaining: 30,
      tier: null,
    })
  })

  it('mock, unavailable и free тоже дают тир null: платить не за что или замок', () => {
    expect(aiAccess('mock').tier).toBeNull()
    expect(aiAccess('unavailable').tier).toBeNull()
    expect(aiAccess('free').tier).toBeNull()
  })

  it('trial и trialSpent дают тир trial, credits - тир credits', () => {
    expect(aiAccess('trial', 1, FREE_TRIAL_LIMIT).tier).toBe('trial')
    expect(aiAccess('trialSpent', FREE_TRIAL_LIMIT, FREE_TRIAL_LIMIT).tier).toBe('trial')
    expect(aiAccess('credits', FREE_TRIAL_LIMIT, FREE_TRIAL_LIMIT, 5).tier).toBe('credits')
  })

  it('пробный остаток считается от FREE_TRIAL_LIMIT, а не от месячного лимита Pro', () => {
    expect(aiAccess('trial', 1, FREE_TRIAL_LIMIT)).toEqual({
      state: 'trial',
      limit: FREE_TRIAL_LIMIT,
      used: 1,
      freeRemaining: 2,
      credits: 0,
      remaining: 2,
      tier: 'trial',
    })
  })

  it('remaining это единый счётчик: свободная квота плюс купленные кадры', () => {
    const access = aiAccess('credits', FREE_TRIAL_LIMIT, FREE_TRIAL_LIMIT, 7)
    expect(access.freeRemaining).toBe(0)
    expect(access.credits).toBe(7)
    expect(access.remaining).toBe(7)
  })

  it('Pro с купленными кадрами суммирует свободную месячную квоту и кадры', () => {
    const access = aiAccess('pro', 4, AI_MONTHLY_LIMIT, 10)
    expect(access.freeRemaining).toBe(26)
    expect(access.credits).toBe(10)
    expect(access.remaining).toBe(36)
  })

  it('отрицательные кадры не рисуют минус в счётчике', () => {
    expect(aiAccess('pro', 0, AI_MONTHLY_LIMIT, -3).credits).toBe(0)
  })
})

describe('AI_FEATURE_COST', () => {
  it('серия фото стоит одну генерацию, мокапы мерча не стоят ничего', () => {
    // Мокапы рисуются локально: гейт на них про правило «это Pro», а не про деньги.
    expect(AI_FEATURE_COST.promoShots).toBe(1)
    expect(AI_FEATURE_COST.merchMockups).toBe(0)
  })
})

describe('константы бесплатного тира', () => {
  it('три попытки на субъект, десять на адрес, один кадр за нажатие', () => {
    expect(FREE_TRIAL_LIMIT).toBe(3)
    expect(FREE_TRIAL_IP_LIMIT).toBe(10)
    expect(FREE_TRIAL_MAX_UNITS).toBe(1)
  })

  it('лимит по адресу строже персонального втрое: NAT не должен упираться в личный потолок', () => {
    expect(FREE_TRIAL_IP_LIMIT).toBeGreaterThan(FREE_TRIAL_LIMIT)
  })
})

describe('AI_TRIAL_FEATURES', () => {
  it('серия фото, серия по референсу и карточка товара входят в пробный тир', () => {
    expect(AI_TRIAL_FEATURES).toEqual(['promoShots', 'referenceShots', 'saleListing'])
  })

  it('разбор референса и мокапы мерча остаются Pro-фичами', () => {
    expect(AI_TRIAL_FEATURES).not.toContain('referenceAnalysis')
    expect(AI_TRIAL_FEATURES).not.toContain('merchMockups')
  })
})

describe('AI_CREDIT_FEATURES', () => {
  it('совпадает с пробным тиром: разбор референса и мокапы мерча кадрами не покупаются', () => {
    expect(AI_CREDIT_FEATURES).toEqual(AI_TRIAL_FEATURES)
    expect(AI_CREDIT_FEATURES).not.toContain('referenceAnalysis')
    expect(AI_CREDIT_FEATURES).not.toContain('merchMockups')
  })
})
