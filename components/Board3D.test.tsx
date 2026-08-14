import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import { BufferGeometry } from 'three'
import { compile } from '@/lib/engine'
import { templateById } from '@/lib/designs/templates'
import { Board3D } from './Board3D'

// Board3D рендерится в реальном <Canvas> из @react-three/fiber, который создаёт WebGL-контекст -
// в jsdom его нет. Тест интересует только эффект жизненного цикла SpeciesMergedMesh (dispose
// геометрии), а не сам WebGL-рендер, поэтому Canvas/useThree/drei подменены на безобидные
// заглушки: дети всё равно монтируются обычным ReactDOM, useMemo/useEffect в SpeciesMergedMesh
// отрабатывают по-настоящему.
vi.mock('@react-three/fiber', () => ({
  Canvas: ({ children }: { children?: React.ReactNode }) => <div data-testid="fake-canvas">{children}</div>,
  useThree: () => ({ camera: { position: { set: vi.fn() }, updateProjectionMatrix: vi.fn() } }),
}))
vi.mock('@react-three/drei', () => ({
  ContactShadows: () => null,
  OrbitControls: () => null,
}))

describe('Board3D: SpeciesMergedMesh освобождает геометрию', () => {
  it('dispose() вызывается на BufferGeometry при размонтировании углового узора', () => {
    // chevron-classic даёт ячейки с poly (угловой рез) -> buildInstances выбирает merged-путь
    // (SpeciesMergedMesh), а не instanced (SpeciesInstances, боксы без пользовательской geometry).
    const model = compile(templateById('chevron-classic')!.build())
    expect(model.cells.some((c) => c.poly !== undefined)).toBe(true)

    const disposeSpy = vi.spyOn(BufferGeometry.prototype, 'dispose')
    const { unmount } = render(<Board3D model={model} label="test" />)
    const callsBeforeUnmount = disposeSpy.mock.calls.length

    unmount()

    // Хотя бы одна геометрия породы освобождена при размонтировании: без useEffect(() => () =>
    // geometry.dispose(), [geometry]) в SpeciesMergedMesh dispose тут вообще не вызывался бы.
    expect(disposeSpy.mock.calls.length).toBeGreaterThan(callsBeforeUnmount)
    disposeSpy.mockRestore()
  })

  it('dispose() вызывается и при пересоздании геометрии на смену узора (не только на unmount)', () => {
    const chevron = compile(templateById('chevron-classic')!.build())
    const gentle = compile(templateById('chevron-gentle')!.build())
    expect(chevron.cells.some((c) => c.poly !== undefined)).toBe(true)
    expect(gentle.cells.some((c) => c.poly !== undefined)).toBe(true)

    const disposeSpy = vi.spyOn(BufferGeometry.prototype, 'dispose')
    const { rerender, unmount } = render(<Board3D model={chevron} label="test" />)
    const callsAfterMount = disposeSpy.mock.calls.length

    rerender(<Board3D model={gentle} label="test" />)
    expect(disposeSpy.mock.calls.length).toBeGreaterThan(callsAfterMount)

    unmount()
    disposeSpy.mockRestore()
  })
})
