import { describe, it, expect } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { ApiUsageGuide } from './ApiUsageGuide'

describe('ApiUsageGuide', () => {
  it('свёрнута по умолчанию и раскрывается по клику, показывая примеры и инструменты MCP', () => {
    render(<ApiUsageGuide locale="ru" />)

    expect(screen.queryByTestId('api-guide-body')).toBeNull()
    expect(screen.getByTestId('api-guide-toggle').getAttribute('aria-expanded')).toBe('false')

    fireEvent.click(screen.getByTestId('api-guide-toggle'))

    expect(screen.getByTestId('api-guide-toggle').getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByTestId('api-guide-body')).toBeDefined()
    expect(screen.getByTestId('api-guide-curl-me')).toBeDefined()
    expect(screen.getByTestId('api-guide-curl-list')).toBeDefined()
    expect(screen.getByTestId('api-guide-curl-create')).toBeDefined()
    expect(screen.getByTestId('api-guide-mcp-connect')).toBeDefined()

    const tools = screen.getByTestId('api-guide-mcp-tools')
    expect(tools.children.length).toBe(5)
  })
})
