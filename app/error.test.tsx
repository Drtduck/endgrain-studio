import { describe, it, expect, vi } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import ErrorBoundary from './error'

describe('Error boundary', () => {
  it('renders a message and calls reset on click', () => {
    const reset = vi.fn()
    const error = Object.assign(new Error('boom'), { digest: 'x' })
    const { getByText } = render(<ErrorBoundary error={error} reset={reset} />)

    expect(getByText(/что-то пошло не так/i)).toBeTruthy()
    fireEvent.click(getByText(/повторить/i))
    expect(reset).toHaveBeenCalledTimes(1)
  })
})
