import type { PromoShotKind } from './types'

/**
 * Промпты продуктовой съёмки. Вынесены отдельной чистой функцией, чтобы их
 * можно было читать и править без запуска сети, а тест ловил главное:
 * в каждом кадре обязана оказаться подстановка с описанием конкретной доски.
 *
 * Пишутся по-английски и подробно: свет, ракурс, фон, оптика, настроение.
 * Модели картинок разбирают такую формулировку заметно точнее, чем «красивое
 * фото доски», а пользователю эта строка не показывается вовсе.
 */
const SCENES: Readonly<Record<PromoShotKind, string>> = {
  hero:
    'Clean e-commerce hero shot. The board stands upright at a slight three-quarter angle on a seamless ' +
    'warm-white sweep, front face fully readable. Large softbox key light from the upper left, white bounce ' +
    'card on the right, one soft contact shadow under the bottom edge. 50mm lens at f/8, camera at board ' +
    'height, everything in focus. Bright, neutral, generous empty space on the right for a price overlay.',
  studioDark:
    'Dramatic studio product shot on a matte charcoal background. The board stands at a three-quarter angle, ' +
    'lit by a narrow strip softbox raking across the end-grain face so every block edge catches a highlight, ' +
    'plus a cool rim light separating the silhouette from the dark backdrop. Deep falloff into black at the ' +
    'corners. 85mm lens at f/5.6, low camera angle looking slightly up. Premium, moody, gallery-like.',
  hands:
    'A craftsman holds the finished board with both hands at chest height, turning it toward the camera. ' +
    'Only forearms and hands are visible: rolled-up sleeves, sawdust on the skin, no face in frame. ' +
    'Background is a softly blurred workshop with warm bokeh from a window. 35mm lens at f/2.0, natural ' +
    'side light, slight motion life in the pose. Honest, handmade, human scale of the object.',
  serving:
    'Overhead-adjacent serving scene on a linen-covered table. The board carries sliced sourdough, aged ' +
    'cheese wedges, grapes, walnuts and a sprig of rosemary, with a small ramekin of olive oil beside it. ' +
    'Warm late-afternoon window light from the left, long soft shadows, a linen napkin and a glass of wine ' +
    'out of focus in the background. 50mm lens at f/2.8, camera 30 degrees above the table. Inviting and appetising.',
  macroOil:
    'Extreme macro of the oiled end-grain face. The camera is almost parallel to the surface, a few beads of ' +
    'finishing oil sit on the wood catching specular highlights, the pores and the glue lines between blocks ' +
    'are razor sharp in a narrow band of focus that falls away fast on both sides. 100mm macro lens at f/4, ' +
    'hard raking light from the right, deep shadow at the left edge. Texture, grain and craftsmanship.',
  workbench:
    'The board lies on a scarred wooden workbench among the tools that made it: a block plane on its side, ' +
    'a marking gauge, chisels in a rack, curls of shavings and a fine layer of sawdust. Dusty daylight from ' +
    'a high workshop window, warm tungsten fill from the left. 35mm lens at f/4, camera at a low ' +
    'three-quarter angle. Working, lived-in, slightly gritty, the story of how it was built.',
  package:
    'Gift packaging shot. The board rests against a kraft paper sleeve tied with baker\'s twine, a plain ' +
    'blank letterpress card and a sprig of dried eucalyptus lie in front of it, all on a neutral grey ' +
    'seamless backdrop. Even diffused catalogue lighting from a large overhead scrim, soft shadows. ' +
    '50mm lens at f/8. Calm, tidy, ready for a gift listing. No readable text anywhere.',
  stack:
    'A stack of four identical boards on a light oak surface, offset so the end-grain pattern of the top one ' +
    'is fully visible and the laminated edges of the ones below read as clean stripes. Soft directional light ' +
    'from the upper right, shallow gradient background in warm beige. 85mm lens at f/5.6, camera slightly ' +
    'above the stack. Suggests a small production run and a maker who repeats a design well.',
  island:
    'Interior lifestyle shot: the board leans against the backsplash on a kitchen island of pale stone. ' +
    'Behind it a bright modern kitchen falls out of focus, with brass fixtures, a linen runner and a bowl ' +
    'of lemons. Soft daylight from a large window on the left, gentle ambient fill. 35mm lens at f/2.2, ' +
    'camera at counter height. Airy, expensive-looking, the object in a real home.',
  edge:
    'Tight detail shot of the board\'s edge treatment: the chamfered edge, the finger grooves routed into ' +
    'the side and the small rubber feet under the corner. Camera low and close, board tilted so the edge ' +
    'profile is drawn by a bright specular line. 100mm lens at f/5.6, focused stack across the profile, ' +
    'soft grey background completely out of focus. Precise, technical, proof of finish quality.',
  flatlay:
    'Symmetrical flat lay shot straight down from above. The board sits dead centre on a pale plaster ' +
    'surface, surrounded with even spacing by a chef\'s knife, a small bowl of coarse salt, halved citrus, ' +
    'fresh herbs and a folded linen cloth. Even soft light from a large overhead source, minimal shadows. ' +
    '35mm lens at f/5.6, perfectly perpendicular camera. Editorial, graphic, evenly balanced composition.',
  catalog:
    'Black and white catalogue photograph. The board floats against a plain mid-grey background, shot ' +
    'straight on with no perspective distortion, edges parallel to the frame. Flat even studio lighting ' +
    'from two large sources, a faint drop shadow to seat the object. 85mm lens at f/8. Full tonal range from ' +
    'clean whites to deep blacks, high micro-contrast on the grain. Archival, documentary, no colour at all.',
}

const COMMON =
  'Photorealistic, no text, no watermark, no logo, no visible brand marks, no faces. ' +
  'The colours, species contrast and block layout of the board must match the reference image exactly.'

export function shotPrompt(kind: PromoShotKind, description: string): string {
  return `${SCENES[kind]}\n\nSubject: ${description}\n\n${COMMON}`
}

/** Общий хвост промпта: нужен и генерации по референсу, чтобы правила совпадали. */
export const PROMO_COMMON_RULES = COMMON
