/**
 * Переход на другой origin. Вынесен отдельной функцией по двум причинам: роутер Next
 * такие переходы не делает, а window.location в тестовой среде не подменяется, и
 * мокать приходится именно модуль.
 */
export function assignLocation(url: string): void {
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  window.location.assign(url)
}
