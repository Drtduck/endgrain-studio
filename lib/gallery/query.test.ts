import { describe, it, expect } from 'vitest'
import { GALLERY_MAX_PAGE, GALLERY_PAGE_SIZE } from './types'
import { galleryOffset, parseGalleryParams } from './query'

describe('parseGalleryParams', () => {
  it('дефолт: sort=new, page=1', () => {
    expect(parseGalleryParams({})).toEqual({ sort: 'new', page: 1 })
  })

  it('принимает popular', () => {
    expect(parseGalleryParams({ sort: 'popular' })).toEqual({ sort: 'popular', page: 1 })
  })

  it('чужой sort приводится к new', () => {
    expect(parseGalleryParams({ sort: 'best' })).toEqual({ sort: 'new', page: 1 })
  })

  it('страница 0 приводится к 1', () => {
    expect(parseGalleryParams({ page: '0' })).toEqual({ sort: 'new', page: 1 })
  })

  it('отрицательная страница приводится к 1', () => {
    expect(parseGalleryParams({ page: '-3' })).toEqual({ sort: 'new', page: 1 })
  })

  it('страница выше потолка приводится к 1', () => {
    expect(parseGalleryParams({ page: String(GALLERY_MAX_PAGE + 1) })).toEqual({ sort: 'new', page: 1 })
  })

  it('страница на потолке принимается', () => {
    expect(parseGalleryParams({ page: String(GALLERY_MAX_PAGE) }).page).toBe(GALLERY_MAX_PAGE)
  })

  it('мусор в page приводится к 1', () => {
    expect(parseGalleryParams({ page: 'abc' })).toEqual({ sort: 'new', page: 1 })
  })
})

describe('galleryOffset', () => {
  it('страница 1 это offset 0', () => {
    expect(galleryOffset(1)).toBe(0)
  })

  it('страница 2 это offset на размер страницы', () => {
    expect(galleryOffset(2)).toBe(GALLERY_PAGE_SIZE)
  })
})
