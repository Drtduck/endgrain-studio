import '@testing-library/jest-dom/vitest'

// В jsdom нет ResizeObserver, а позиционирование Base UI (floating-ui) на него
// опирается. Без заглушки падает любой тест с попапом.
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  } as unknown as typeof ResizeObserver
}
