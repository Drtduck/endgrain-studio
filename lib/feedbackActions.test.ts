import { describe, it, expect, beforeEach } from 'vitest'
import { FEEDBACK_MAX_ACTIONS, type FeedbackAction } from '@/lib/feedback'
import {
  clearActions,
  describeClickable,
  describeForm,
  getRecentActions,
  pushAction,
  recordAction,
  truncateActionLabel,
} from '@/lib/feedbackActions'

function action(kind: FeedbackAction['kind'], label: string): FeedbackAction {
  return { t: '2026-08-12T10:00:00.000Z', kind, label }
}

describe('lib/feedbackActions', () => {
  beforeEach(() => {
    clearActions()
    document.body.innerHTML = ''
  })

  it('truncateActionLabel схлопывает пробелы и режет по лимиту', () => {
    expect(truncateActionLabel('  два   слова \n')).toBe('два слова')
    expect(truncateActionLabel('a'.repeat(120)).length).toBe(80)
    expect(truncateActionLabel('a'.repeat(120)).endsWith('...')).toBe(true)
  })

  it('pushAction держит длину буфера в пределах max', () => {
    let buffer: FeedbackAction[] = []
    for (let i = 0; i < FEEDBACK_MAX_ACTIONS + 10; i += 1) {
      buffer = pushAction(buffer, action('click', `кнопка ${i}`))
    }
    expect(buffer.length).toBe(FEEDBACK_MAX_ACTIONS)
    expect(buffer[buffer.length - 1]?.label).toBe(`кнопка ${FEEDBACK_MAX_ACTIONS + 9}`)
  })

  it('pushAction схлопывает подряд идущие одинаковые переходы', () => {
    const first = pushAction([], action('route', '/board'))
    const second = pushAction(first, action('route', '/board'))
    expect(second.length).toBe(1)
    const third = pushAction(second, action('route', '/landing'))
    expect(third.length).toBe(2)
  })

  it('recordAction пишет в sessionStorage, getRecentActions отдаёт хвост', () => {
    recordAction('click', 'Экспорт')
    recordAction('route', '/board')
    const recent = getRecentActions()
    expect(recent.length).toBe(2)
    expect(recent[0]?.kind).toBe('click')
    expect(recent[1]?.label).toBe('/board')

    expect(getRecentActions(1).length).toBe(1)
    clearActions()
    expect(getRecentActions().length).toBe(0)
  })

  it('describeClickable берёт ближайшую кнопку и предпочитает aria-label', () => {
    document.body.innerHTML = '<button aria-label="Экспорт PNG"><span id="s">иконка</span></button>'
    const span = document.getElementById('s')
    expect(span).not.toBe(null)
    expect(describeClickable(span as Element)).toBe('Экспорт PNG')
  })

  it('describeClickable молчит про элементы окна фидбека и про неинтерактив', () => {
    document.body.innerHTML =
      '<div data-feedback-ui><button id="f">Отправить</button></div><div id="plain">просто текст</div>'
    expect(describeClickable(document.getElementById('f') as Element)).toBe(null)
    expect(describeClickable(document.getElementById('plain') as Element)).toBe(null)
  })

  it('describeClickable подставляет href для ссылок', () => {
    document.body.innerHTML = '<a id="a" href="/landing">Про студию</a><a id="b" href="/x"></a>'
    expect(describeClickable(document.getElementById('a') as Element)).toBe('Про студию (/landing)')
    expect(describeClickable(document.getElementById('b') as Element)).toBe('ссылка /x')
  })

  it('describeForm берёт aria-label, иначе говорит про форму без имени', () => {
    document.body.innerHTML = '<form id="one" aria-label="вход"></form><form class="plain"></form>'
    expect(describeForm(document.getElementById('one') as HTMLFormElement)).toBe('форма «вход»')
    expect(describeForm(document.querySelector('form.plain') as HTMLFormElement)).toBe('форма без имени')
  })
})
