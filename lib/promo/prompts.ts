import type { PromoShotKind } from './types'

/**
 * Промпты продуктовой съёмки. Вынесены отдельной чистой функцией, чтобы их
 * можно было читать и править без запуска сети, а тест ловил главное:
 * в каждом кадре обязана оказаться подстановка с описанием конкретной доски.
 */
const SCENES: Readonly<Record<PromoShotKind, string>> = {
  hero:
    'Studio product photo on a clean light background, board standing at a slight angle, ' +
    'soft diffused key light from the left, gentle shadow, plenty of negative space for a shop listing.',
  lifestyle:
    'Lifestyle kitchen scene: the board lies on a wooden counter with fresh herbs, ' +
    'a chef knife, sliced sourdough and cherry tomatoes on it, warm morning window light, shallow depth of field.',
  macro:
    'Extreme macro of the end-grain surface, camera almost parallel to the face, ' +
    'raking light revealing pores and the joint lines between blocks, razor-thin depth of field.',
  package:
    'Packaging shot: the board next to a plain kraft paper sleeve and a small ' +
    'letterpress card with no readable text, neutral grey backdrop, catalogue lighting.',
}

const COMMON =
  'Photorealistic, 35mm lens look, no text, no watermark, no logo, no people, ' +
  'colours and pattern of the board must match the reference image exactly.'

export function shotPrompt(kind: PromoShotKind, description: string): string {
  return `${SCENES[kind]}\n\nSubject: ${description}\n\n${COMMON}`
}
