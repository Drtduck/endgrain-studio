// Подбор фото для статей блога через Pexels API: поиск кандидатов по теме,
// скачивание для визуальной проверки (агент обязан открыть и посмотреть
// каждого кандидата, а не доверять описанию), и сохранение выбранного фото
// в public/blog/images/<slug>-<n>.jpg с данными для атрибуции.
//
// PEXELS_API берётся из окружения, фолбэк - низкочувствительный ключ ниже
// (общий, с невысоким лимитом; для продакшн-объёма нужен свой ключ в env).
//
// Использование:
//   node scripts/blog-images.mjs search "<запрос>" [--per-page 8] [--out dir]
//     -> качает кандидатов в <out> и пишет туда же манифест с фотографами
//   node scripts/blog-images.mjs pick <id> --slug <slug> --n <n> --manifest <manifest.json>
//     -> копирует выбранного кандидата в public/blog/images/<slug>-<n>.jpg
//        и печатает JSON с атрибуцией (имя фотографа, ссылка на Pexels)
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

const FALLBACK_KEY = 'bxczd6tCJT2UbgIefHtLshqlQvhEUiPijgNJBPMQnbDQHWl46QRvzrO4'
const API_KEY = process.env.PEXELS_API || FALLBACK_KEY

function slugifyQuery(query) {
  return query
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

async function search(query, { perPage, out }) {
  const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=${perPage}`
  const res = await fetch(url, { headers: { Authorization: API_KEY } })
  if (!res.ok) throw new Error(`Pexels search failed: ${res.status} ${await res.text()}`)
  const json = await res.json()

  await mkdir(out, { recursive: true })
  const manifest = []
  for (const photo of json.photos ?? []) {
    // Размер large: достаточно для верстки статьи (макс. ширина колонки ~700px
    // на десктопе, retina укладывается), но заметно легче оригинала.
    const imgRes = await fetch(photo.src.large)
    const buffer = Buffer.from(await imgRes.arrayBuffer())
    const file = path.join(out, `${photo.id}.jpg`)
    await writeFile(file, buffer)
    manifest.push({
      id: photo.id,
      file,
      photographer: photo.photographer,
      photographerUrl: photo.photographer_url,
      pexelsUrl: photo.url,
      width: photo.width,
      height: photo.height,
      alt: photo.alt,
    })
    console.log(`downloaded ${file} (${buffer.length} bytes) by ${photo.photographer}`)
  }

  const manifestPath = path.join(out, `${slugifyQuery(query)}-manifest.json`)
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2))
  console.log(`manifest: ${manifestPath}`)
  return manifest
}

async function pick(id, { slug, n, manifest }) {
  const list = JSON.parse(await readFile(manifest, 'utf8'))
  const entry = list.find((p) => String(p.id) === String(id))
  if (!entry) throw new Error(`candidate ${id} not found in ${manifest}`)

  const destDir = path.resolve(import.meta.dirname, '../public/blog/images')
  await mkdir(destDir, { recursive: true })
  const dest = path.join(destDir, `${slug}-${n}.jpg`)
  await copyFile(entry.file, dest)

  const attribution = {
    src: `/blog/images/${slug}-${n}.jpg`,
    photographer: entry.photographer,
    photographerUrl: entry.photographerUrl,
    pexelsUrl: entry.pexelsUrl,
    width: entry.width,
    height: entry.height,
    alt: entry.alt,
  }
  console.log(`saved ${dest}`)
  console.log(JSON.stringify(attribution, null, 2))
  return attribution
}

function parseArgs(rest) {
  const flags = {}
  const positional = []
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i]
    if (arg.startsWith('--')) {
      flags[arg.slice(2)] = rest[i + 1]
      i++
    } else {
      positional.push(arg)
    }
  }
  return { flags, positional }
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2)
  const { flags, positional } = parseArgs(rest)

  if (cmd === 'search') {
    const query = positional[0]
    if (!query) throw new Error('usage: blog-images.mjs search "<query>" [--per-page 8] [--out dir]')
    await search(query, {
      perPage: flags['per-page'] ? Number(flags['per-page']) : 8,
      out: flags.out ?? path.resolve(import.meta.dirname, '../.tmp/blog-images'),
    })
    return
  }

  if (cmd === 'pick') {
    const id = positional[0]
    if (!id || !flags.slug || !flags.n || !flags.manifest) {
      throw new Error('usage: blog-images.mjs pick <id> --slug <slug> --n <n> --manifest <manifest.json>')
    }
    await pick(id, { slug: flags.slug, n: flags.n, manifest: flags.manifest })
    return
  }

  throw new Error('usage: blog-images.mjs <search|pick> ...')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
