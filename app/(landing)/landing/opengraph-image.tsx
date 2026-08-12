import { ImageResponse } from 'next/og'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { SPECIES } from '@/lib/species'

export const alt = 'Endgrain Studio: Пилим как надо'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

// Четыре полосы-породы, те же, что и в декоративном фоне хиро-секции лендинга
// (components/landing/LandingHero.tsx), чтобы OG-картинка не расходилась с сайтом.
const STRIP_IDS = ['walnut', 'padauk', 'maple', 'wenge'] as const
const speciesById = new Map(SPECIES.map((s) => [s.id, s]))

export default async function OgImage() {
  // PT Sans уже лежит в public/fonts с фазы 5 (кириллический PDF).
  // Второй раз тащить шрифт из сети на билд-этапе незачем.
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
          <div style={{ display: 'flex', fontSize: 40, color: '#5A5048', marginBottom: 16 }}>
            Endgrain Studio
          </div>
          <div style={{ display: 'flex', fontSize: 84, lineHeight: 1.05, color: '#241E19' }}>
            <span>Пилим как&nbsp;</span>
            <span style={{ color: '#14615A' }}>надо</span>
          </div>
          <div style={{ display: 'flex', fontSize: 28, color: '#5A5048', marginTop: 24 }}>
            endgrain.app
          </div>
        </div>
        <div style={{ display: 'flex', width: 220, height: '100%' }}>
          {STRIP_IDS.map((id) => (
            <div key={id} style={{ display: 'flex', flex: 1, height: '100%', background: speciesById.get(id)?.hex ?? '#cccccc' }} />
          ))}
        </div>
      </div>
    ),
    { ...size, fonts: [{ name: 'PT Sans', data: bold, weight: 700, style: 'normal' }] },
  )
}
