'use client'

import { useEffect, useLayoutEffect, useMemo, useRef, type ElementRef, type RefObject } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { ContactShadows, OrbitControls } from '@react-three/drei'
import {
  BufferAttribute,
  BufferGeometry as ThreeBufferGeometry,
  Color,
  InstancedBufferAttribute,
  Matrix4,
  Quaternion,
  Vector3,
  type BufferGeometry,
  type InstancedMesh,
  type Material,
} from 'three'
import type { BoardModel } from '@/lib/engine'
import { jitteredHex } from '@/lib/render3d/color'
import { buildInstances, cameraDistance, type MergedSpeciesGroup, type SpeciesGroup } from '@/lib/render3d/instances'

const NO_ROTATION = new Quaternion()

// three.js цвета не понимают CSS-переменные, поэтому держим значения токенов явными
// константами: SCENE_BG = --bg-canvas, SCENE_GROUND = затемнённый --bg-canvas для hemisphere light.
const SCENE_BG = '#E9E3D8'
const SCENE_GROUND = '#B9A893'

/**
 * Одна порода = один InstancedMesh. Матрицы и цвета пишутся императивно:
 * React-элемент на каждую ячейку стоил бы 4000 узлов дерева ради данных,
 * которые всё равно уезжают в один буфер.
 */
function SpeciesInstances({ group }: { group: SpeciesGroup }) {
  const meshRef = useRef<InstancedMesh>(null)

  useLayoutEffect(() => {
    const mesh = meshRef.current
    if (!mesh) return
    const matrix = new Matrix4()
    const position = new Vector3()
    const scale = new Vector3()
    const color = new Color()
    const colors = new Float32Array(group.items.length * 3)

    group.items.forEach((item, index) => {
      position.set(item.position[0], item.position[1], item.position[2])
      scale.set(item.scale[0], item.scale[1], item.scale[2])
      matrix.compose(position, NO_ROTATION, scale)
      mesh.setMatrixAt(index, matrix)
      color.set(jitteredHex(group.hex, item.jitter))
      colors[index * 3] = color.r
      colors[index * 3 + 1] = color.g
      colors[index * 3 + 2] = color.b
    })

    mesh.instanceMatrix.needsUpdate = true
    mesh.instanceColor?.dispose()
    mesh.instanceColor = new InstancedBufferAttribute(colors, 3)
    mesh.instanceColor.needsUpdate = true
    mesh.computeBoundingSphere()
  }, [group])

  return (
    <instancedMesh
      ref={meshRef}
      // Геометрия и материал приходят детьми, поэтому первые два аргумента конструктора пустые.
      args={[undefined as unknown as BufferGeometry, undefined as unknown as Material, group.items.length]}
      castShadow
      receiveShadow
    >
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial roughness={0.72} metalness={0.02} />
    </instancedMesh>
  )
}

/**
 * Одна порода = одна слитая геометрия (угловой узор). Позиции и нормали уже посчитаны в
 * `buildInstances`, здесь только цвет: `jitter` на вершину плюс порода превращаются в
 * вершинный цвет, тот же трюк, что и `instanceColor` у боксов, только на уровне вершин.
 */
function SpeciesMergedMesh({ group }: { group: MergedSpeciesGroup }) {
  const geometry = useMemo(() => {
    const geo = new ThreeBufferGeometry()
    geo.setAttribute('position', new BufferAttribute(group.positions, 3))
    geo.setAttribute('normal', new BufferAttribute(group.normals, 3))
    const color = new Color()
    const vertexCount = group.positions.length / 3
    const colors = new Float32Array(vertexCount * 3)
    for (let i = 0; i < vertexCount; i += 1) {
      color.set(jitteredHex(group.hex, group.jitters[i] ?? 0))
      colors[i * 3] = color.r
      colors[i * 3 + 1] = color.g
      colors[i * 3 + 2] = color.b
    }
    geo.setAttribute('color', new BufferAttribute(colors, 3))
    return geo
  }, [group])

  return (
    <mesh geometry={geometry} castShadow receiveShadow>
      <meshStandardMaterial roughness={0.72} metalness={0.02} vertexColors />
    </mesh>
  )
}

/**
 * Camera prop у <Canvas> применяется только при монтировании (R3F так устроен), поэтому смена
 * размера доски без пересоздания сцены оставляла камеру на старом расстоянии. Этот компонент
 * живёт внутри Canvas и явно переносит камеру и цель контролов при каждом изменении cameraDistance.
 */
function CameraRig({
  distance,
  controlsRef,
}: {
  distance: number
  controlsRef: RefObject<ElementRef<typeof OrbitControls> | null>
}) {
  const { camera } = useThree()

  useEffect(() => {
    camera.position.set(distance * 0.7, distance * 0.8, distance * 0.9)
    camera.updateProjectionMatrix()
    const controls = controlsRef.current
    if (controls) {
      controls.target.set(0, 0, 0)
      controls.update()
    }
  }, [distance, camera, controlsRef])

  return null
}

export function Board3D({ model, label }: { model: BoardModel; label: string }) {
  const instances = useMemo(() => buildInstances(model), [model])
  const distance = cameraDistance(instances)
  // Пустая доска даёт sizeUnits 0 и вырожденную ортокамеру теней, поэтому масштаб не должен падать ниже пола.
  const shadowScale = Math.max(Math.max(instances.sizeUnits[0], instances.sizeUnits[2]) * 2.4, 0.2)
  const controlsRef = useRef<ElementRef<typeof OrbitControls> | null>(null)

  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      camera={{ position: [distance * 0.7, distance * 0.8, distance * 0.9], fov: 40 }}
      aria-label={label}
      className="h-full w-full"
    >
      <color attach="background" args={[SCENE_BG]} />
      <ambientLight intensity={0.55} />
      <hemisphereLight intensity={0.35} groundColor={SCENE_GROUND} />
      <directionalLight
        position={[distance, distance * 1.5, distance * 0.6]}
        intensity={1.4}
        castShadow
        shadow-mapSize={[1024, 1024]}
      />
      {instances.kind === 'instanced'
        ? instances.groups.map((group) => (
            // Число инстансов - аргумент конструктора, поэтому смена размера доски пересоздаёт меш.
            <SpeciesInstances key={`${group.speciesId}:${group.items.length}`} group={group} />
          ))
        : instances.groups.map((group) => (
            <SpeciesMergedMesh key={`${group.speciesId}:${group.cellCount}`} group={group} />
          ))}
      <ContactShadows position={[0, -0.002, 0]} opacity={0.42} scale={shadowScale} blur={2.2} far={1.5} />
      <OrbitControls
        ref={controlsRef}
        makeDefault
        enablePan
        enableZoom
        enableRotate
        target={[0, 0, 0]}
        minDistance={distance * 0.3}
        maxDistance={distance * 3}
      />
      <CameraRig distance={distance} controlsRef={controlsRef} />
    </Canvas>
  )
}
