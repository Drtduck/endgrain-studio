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
  /** Загруженная картинка (profiles.avatar_url). null или пусто - рисуем инициал. */
  readonly url?: string | null
  readonly size?: 'sm' | 'md' | 'lg'
}

const SIZE_CLASS: Readonly<Record<NonNullable<AvatarProps['size']>, string>> = {
  sm: 'size-8 text-xs',
  md: 'size-11 text-sm',
  lg: 'size-16 text-xl',
}

export function Avatar({ seed, label, url = null, size = 'md' }: AvatarProps) {
  // next/image здесь не годится: адрес приходит с хоста Supabase Storage
  // конкретного проекта, а он берётся из переменных окружения - в
  // remotePatterns его не прописать статически. Размер фиксирован классом,
  // картинка всегда квадрат 256 px после ресайза на клиенте.
  if (url !== null && url.length > 0) {
    return (
      <img
        data-testid="avatar"
        data-avatar-kind="image"
        src={url}
        alt=""
        aria-hidden="true"
        className={`shrink-0 rounded-full bg-surface-raised object-cover ${SIZE_CLASS[size]}`}
      />
    )
  }

  const initial = avatarInitial(label)
  return (
    <span
      data-testid="avatar"
      data-avatar-kind="initial"
      aria-hidden="true"
      className={`flex shrink-0 items-center justify-center rounded-full font-display font-semibold text-white ${SIZE_CLASS[size]}`}
      style={{ backgroundColor: avatarColor(seed) }}
    >
      {initial}
    </span>
  )
}
