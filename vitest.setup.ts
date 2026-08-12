import '@testing-library/jest-dom/vitest'
import { vi } from 'vitest'

// Маркер 'server-only' бросает при импорте вне серверного графа React. В vitest
// границы 'use server' нет, поэтому он валит любой тест, который через экшен
// дотянулся до серверного модуля. Мокаем пустышкой: сам смысл маркера (защита
// от утечки service-ключа в клиентский бандл) проверяется на next build.
vi.mock('server-only', () => ({}))

// В jsdom нет ResizeObserver, а позиционирование Base UI (floating-ui) на него
// опирается. Без заглушки падает любой тест с попапом.
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  } as unknown as typeof ResizeObserver
}
