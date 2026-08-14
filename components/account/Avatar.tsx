/**
 * Инициал в кружке с детерминированным цветом от хеша id: без загруженной
 * картинки у нас всё равно должен быть узнаваемый «аватар», который у одного
 * и того же человека не меняет цвет между рендерами и разными страницами
 * (AccountMenu, /account, AuthorLine, /u/[id]) - хеш от id, а не Math.random.
 */
const PALETTE: readonly string[] = [
  '#f97066', // красный
  '#f79009', // оранжевый
  '#eaaa08', // жёлтый
  '#66c61c', // зелёный
  '#15b79e', // бирюзовый
  '#2e90fa', // синий
  '#7a5af8', // фиолетовый
  '#ee46bc', // розовый
]

function hashString(input: string): number {
  let hash = 0
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 31 + input.charCodeAt(i)) | 0
  }
  return Math.abs(hash)
}

export function avatarColor(seed: string): string {
  if (seed.length === 0) return PALETTE[0] as string
  return PALETTE[hashString(seed) % PALETTE.length] as string
}

export function avatarInitial(name: string): string {
  const trimmed = name.trim()
  return trimmed.length === 0 ? '' : trimmed.charAt(0).toUpperCase()
}

export interface AvatarProps {
  /** Стабильный источник цвета - id пользователя, не имя (имя можно сменить). */
  readonly seed: string
  /** Буква инициала - обычно имя или почта. */
  readonly label: string
  readonly size?: 'sm' | 'md' | 'lg'
}

const SIZE_CLASS: Readonly<Record<NonNullable<AvatarProps['size']>, string>> = {
  sm: 'size-8 text-xs',
  md: 'size-11 text-sm',
  lg: 'size-16 text-xl',
}

export function Avatar({ seed, label, size = 'md' }: AvatarProps) {
  const initial = avatarInitial(label)
  return (
    <span
      data-testid="avatar"
      aria-hidden="true"
      className={`flex shrink-0 items-center justify-center rounded-full font-display font-semibold text-white ${SIZE_CLASS[size]}`}
      style={{ backgroundColor: avatarColor(seed) }}
    >
      {initial}
    </span>
  )
}
