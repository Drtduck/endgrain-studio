// Однократный скрипт: пишет крошечный PNG для e2e без единой зависимости.
// Держим его в репозитории, чтобы фикстуру можно было воспроизвести, а не «где-то нашли картинку».
import { deflateSync } from 'node:zlib'
import { writeFileSync } from 'node:fs'

const WIDTH = 48
const HEIGHT = 32
const COLORS = [
  [240, 232, 210],
  [150, 90, 55],
  [40, 34, 30],
]

const table = new Int32Array(256)
for (let n = 0; n < 256; n += 1) {
  let c = n
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  table[n] = c
}

function crc32(buffer) {
  let c = 0xffffffff
  for (const byte of buffer) c = table[(c ^ byte) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([length, body, crc])
}

const raw = Buffer.alloc(HEIGHT * (1 + WIDTH * 3))
for (let y = 0; y < HEIGHT; y += 1) {
  const rowStart = y * (1 + WIDTH * 3)
  raw[rowStart] = 0
  const band = y < HEIGHT / 3 ? 0 : y < (2 * HEIGHT) / 3 ? 1 : 2
  for (let x = 0; x < WIDTH; x += 1) {
    const color = COLORS[x < WIDTH / 2 ? band : (band + 1) % 3]
    const p = rowStart + 1 + x * 3
    raw[p] = color[0]
    raw[p + 1] = color[1]
    raw[p + 2] = color[2]
  }
}

const ihdr = Buffer.alloc(13)
ihdr.writeUInt32BE(WIDTH, 0)
ihdr.writeUInt32BE(HEIGHT, 4)
ihdr[8] = 8
ihdr[9] = 2

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw)),
  chunk('IEND', Buffer.alloc(0)),
])

writeFileSync(new URL('./demo-blocks.png', import.meta.url), png)
console.log(`demo-blocks.png: ${png.length} байт`)
