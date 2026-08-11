import { clsx, type ClassValue } from "clsx"
import type { CSSProperties } from "react"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * CSS-переменная для заливки нативного `<input type="range">`: значение читает
 * ::-webkit-slider-runnable-track через градиент, потому что пользовательские
 * свойства (в отличие от обычных) наследуются в псевдоэлементы, а обычный CSS - нет.
 */
export function rangeFillVar(value: number, min: number, max: number): CSSProperties {
  const pct = max > min ? ((value - min) / (max - min)) * 100 : 0
  return { '--range-fill': `${Math.min(100, Math.max(0, pct))}%` } as CSSProperties
}

export const RANGE_INPUT_CLASS =
  'h-3.5 w-full cursor-pointer appearance-none bg-transparent ' +
  '[&::-webkit-slider-runnable-track]:h-1 [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-runnable-track]:bg-[linear-gradient(to_right,var(--color-accent)_var(--range-fill),var(--color-surface-sunken)_var(--range-fill))] ' +
  '[&::-moz-range-track]:h-1 [&::-moz-range-track]:rounded-full [&::-moz-range-track]:bg-surface-sunken ' +
  '[&::-moz-range-progress]:h-1 [&::-moz-range-progress]:rounded-full [&::-moz-range-progress]:bg-accent ' +
  '[&::-webkit-slider-thumb]:-mt-[5px] [&::-webkit-slider-thumb]:size-3.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-[1.5px] [&::-webkit-slider-thumb]:border-accent [&::-webkit-slider-thumb]:bg-surface-raised [&::-webkit-slider-thumb]:shadow-sm ' +
  '[&::-moz-range-thumb]:size-3.5 [&::-moz-range-thumb]:appearance-none [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-[1.5px] [&::-moz-range-thumb]:border-accent [&::-moz-range-thumb]:bg-surface-raised [&::-moz-range-thumb]:shadow-sm ' +
  'focus:outline-none [&:focus-visible::-webkit-slider-thumb]:shadow-focus [&:focus-visible::-moz-range-thumb]:shadow-focus'
