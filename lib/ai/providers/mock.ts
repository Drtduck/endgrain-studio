import 'server-only'
import { createHash } from 'node:crypto'
import { deflateSync } from 'node:zlib'
import type { ImageOutcome, ImageProvider, ImageRequest } from './types'

/** CRC32 по образцу спецификации PNG: таблица считается один раз при загрузке модуля. */
const CRC_TABLE = ((): readonly number[] => {
  const table: number[] = []
  for (let n = 0; n < 256; n += 1) {
    let c = n
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table.push(c >>> 0)
  }
  return table
})()

function crc32(bytes: Buffer): number {
  let c = 0xffffffff
  for (const byte of bytes) c = CRC_TABLE[(c ^ byte) & 0xff]! ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length, 0)
  const typed = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(typed), 0)
  return Buffer.concat([length, typed, crc])
}

/**
 * Детерминированная однотонная PNG-заглушка: размер и цвет считаются из хеша
 * промпта, поэтому один и тот же запрос в тестах и в демо-режиме всегда даёт
 * один и тот же байт-в-байт кадр, а разные пресеты отличаются оттенком.
 * "Подпись" это сама детерминированность - по хешу видно, какой именно
 * запрос породил кадр, без похода в сеть за настоящей картинкой.
 */
function solidPng(prompt: string): string {
  const digest = createHash('sha256').update(prompt).digest()
  const [r, g, b] = [digest[0]!, digest[1]!, digest[2]!]
  const size = 64

  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

  const ihdrData = Buffer.alloc(13)
  ihdrData.writeUInt32BE(size, 0)
  ihdrData.writeUInt32BE(size, 4)
  ihdrData[8] = 8 // bit depth
  ihdrData[9] = 2 // color type: RGB
  ihdrData[10] = 0
  ihdrData[11] = 0
  ihdrData[12] = 0
  const ihdr = chunk('IHDR', ihdrData)

  const row = Buffer.alloc(1 + size * 3)
  for (let x = 0; x < size; x += 1) {
    row[1 + x * 3] = r
    row[1 + x * 3 + 1] = g
    row[1 + x * 3 + 2] = b
  }
  const raw = Buffer.concat(Array.from({ length: size }, () => row))
  const idat = chunk('IDAT', deflateSync(raw))

  const iend = chunk('IEND', Buffer.alloc(0))

  const png = Buffer.concat([signature, ihdr, idat, iend])
  return `data:image/png;base64,${png.toString('base64')}`
}

async function generate(req: ImageRequest): Promise<ImageOutcome> {
  return { kind: 'image', dataUrl: solidPng(req.prompt), provider: 'mock' }
}

export const mockProvider: ImageProvider = { id: 'mock', tier: 'cheap', generate }
