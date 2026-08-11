/** Незаконченные фичи выключены здесь, а не удалены из main. */
export const flags = {
  pro: process.env['NEXT_PUBLIC_PRO_UNLOCK'] === '1',
  threeD: true,
  generators: true,
} as const
