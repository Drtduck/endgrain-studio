/**
 * Вписывание узора доски в прямоугольник сцены. Чистая арифметика без DOM:
 * ею пользуются и мокапы мерча, и сцены-заглушки серии фото, поэтому две
 * панели не могут разъехаться в масштабе незаметно.
 */
export interface PrintArea {
  readonly x: number
  readonly y: number
  readonly w: number
  readonly h: number
}

export interface PrintFit {
  readonly scale: number
  readonly dx: number
  readonly dy: number
}

function place(widthMm: number, lengthMm: number, area: PrintArea, scale: number): PrintFit {
  return {
    scale,
    dx: area.x + (area.w - widthMm * scale) / 2,
    dy: area.y + (area.h - lengthMm * scale) / 2,
  }
}

/**
 * Cover: узор закрывает прямоугольник целиком, лишнее по короткой стороне срежет clipPath.
 * Пустые поля на футболке выглядят браком, поэтому мерч печатается только так.
 */
export function fitPatternCover(widthMm: number, lengthMm: number, area: PrintArea): PrintFit {
  if (widthMm <= 0 || lengthMm <= 0) return { scale: 0, dx: area.x, dy: area.y }
  return place(widthMm, lengthMm, area, Math.max(area.w / widthMm, area.h / lengthMm))
}

/** Contain: доска видна целиком. Так снимают витрину и упаковку, где важен силуэт изделия. */
export function fitPatternContain(widthMm: number, lengthMm: number, area: PrintArea): PrintFit {
  if (widthMm <= 0 || lengthMm <= 0) return { scale: 0, dx: area.x, dy: area.y }
  return place(widthMm, lengthMm, area, Math.min(area.w / widthMm, area.h / lengthMm))
}
