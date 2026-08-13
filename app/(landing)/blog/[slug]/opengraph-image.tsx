import { ImageResponse } from 'next/og'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { notFound } from 'next/navigation'
import { postBySlug } from '@/lib/blog/posts'
import { t } from '@/lib/i18n'

export const alt = t('ru', 'blog.post.ogLabel')
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

// Тот же визуальный шаблон, что и у OG-картинки лендинга: фон #EFEAE1, полосы
// четырёх пород справа, шрифт PT Sans. Отличается только текст: заголовок статьи
// вместо слогана, и надпись «Блог · Endgrain Studio» сверху.
const STRIP_COLORS = ['#5b3a24', '#a8422a', '#e3caa1', '#3a2a20']

// Длинный заголовок выезжал бы за карточку на большом кегле: до 40 символов
// держим крупный шрифт, дальше уменьшаем.
function titleFontSize(title: string): number {
  return title.length <= 40 ? 84 : 64
}

export default async function BlogOgImage(props: { params: Promise<{ slug: string }> }) {
  const { slug } = await props.params
  const post = postBySlug(slug)
  if (!post) notFound()

  const bold = await readFile(join(process.cwd(), 'public/fonts/PTSans-Bold.ttf'))

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          background: '#EFEAE1',
          fontFamily: 'PT Sans',
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            padding: '0 0 0 72px',
            flex: 1,
          }}
        >
          <div style={{ display: 'flex', fontSize: 32, color: '#5A5048', marginBottom: 20 }}>
            {t(post.lang, 'blog.post.ogLabel')}
          </div>
          <div style={{ display: 'flex', fontSize: titleFontSize(post.title), lineHeight: 1.1, color: '#241E19' }}>
            {post.title}
          </div>
        </div>
        <div style={{ display: 'flex', width: 220, height: '100%' }}>
          {STRIP_COLORS.map((color) => (
            <div key={color} style={{ display: 'flex', flex: 1, height: '100%', background: color }} />
          ))}
        </div>
      </div>
    ),
    { ...size, fonts: [{ name: 'PT Sans', data: bold, weight: 700, style: 'normal' }] },
  )
}
