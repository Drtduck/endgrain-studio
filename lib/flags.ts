/** Незаконченные фичи выключены здесь, а не удалены из main. */
export const flags = {
  pro: process.env['NEXT_PUBLIC_PRO_UNLOCK'] === '1',
  /**
   * Аварийный рубильник конкурса: PUBLIC_STUDIO=1 снова открывает студию без
   * аккаунта. Переменная серверная (без NEXT_PUBLIC_), читает её только proxy;
   * в клиентском бандле она разворачивается в undefined, то есть в false.
   */
  publicStudio: process.env['PUBLIC_STUDIO'] === '1',
  threeD: true,
  generators: true,
} as const
