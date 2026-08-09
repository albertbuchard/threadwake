import type { WorkNode, Workstream } from './domain'
import { createInitialState, WORK_NODES, WORKSTREAMS } from './seed'
import { selectVisibleNodes } from './state'
import {
  DEFAULT_INNER_RADIUS_RATIO,
  MAX_ZOOM,
  MIN_ZOOM,
  TWO_WEEKS_MS,
  clampInnerRadiusRatio,
  clampManualNodeOffset,
  clampZoom,
  computeGraphLayout,
  createAdaptiveTimeRings,
  createForceRelaxation,
  createTemporalLayout,
  dateToRadius,
  distanceToSegment,
  forceRelaxationKey,
  forceGlyphPairPenetration,
  nodesInRect,
  pointInPolygon,
  applyForceRelaxation,
  rotationForFocusedRelaxedNode,
  rotationForFocusedNode,
  rotationForFocusedStream,
  retargetForceRelaxation,
  ringCadenceKey,
  runForceRelaxationToStop,
  shouldRestartForceRelaxation,
  shortestAngleDelta,
  stepForceRelaxation,
} from './geometry'

const streams: Workstream[] = [
  { id: 'east', name: 'East', description: 'East lane', angle: 0, color: '#fff', owner: 'Test' },
  { id: 'south', name: 'South', description: 'South lane', angle: Math.PI / 2, color: '#0ff', owner: 'Test' },
]

function node(
  id: string,
  workstreamId: string,
  startedAt: string,
  endedAt?: string,
  satelliteOfNodeId?: string,
): WorkNode {
  return {
    id,
    title: id,
    type: satelliteOfNodeId ? 'test' : 'experiment',
    status: 'successful',
    lifecycle: 'done',
    workstreamId,
    sourceThreadIds: ['thread'],
    owner: 'Test',
    startedAt,
    endedAt,
    summary: id,
    outcome: id,
    origin: 'Test fixture',
    unresolvedQuestions: [],
    nextActions: [],
    artifactIds: [],
    activity: [],
    satelliteOfNodeId,
    parentNodeId: satelliteOfNodeId,
  }
}

describe('temporal graph geometry', () => {
  const nodes = [
    node('old', 'east', '2026-01-01T00:00:00.000Z'),
    node('duration', 'east', '2026-01-15T00:00:00.000Z', '2026-02-12T00:00:00.000Z'),
    node('new', 'south', '2026-03-12T00:00:00.000Z'),
    node('satellite', 'east', '2026-02-13T00:00:00.000Z', undefined, 'duration'),
  ]

  it('maps absolute time monotonically to radius while stream angle stays stable', () => {
    const layout = createTemporalLayout(nodes, streams, { width: 800, height: 600, padding: 60 })
    expect(layout.positions.old?.radius).toBeLessThan(layout.positions.duration?.endRadius ?? 0)
    expect(layout.positions.duration?.endRadius).toBeLessThan(layout.positions.new?.radius ?? 0)
    expect(layout.positions.old?.angle).toBeCloseTo(0)
    expect(layout.positions.new?.angle).toBeCloseTo(Math.PI / 2)
    expect(layout.positions.duration?.isDuration).toBe(true)
    expect(layout.positions.duration?.startRadius).toBeLessThan(layout.positions.duration?.endRadius ?? 0)
  })

  it('places satellites close to their parent without using their date as a new lane', () => {
    const layout = computeGraphLayout(nodes, streams, 800, 600)
    const parent = layout.positions.duration
    const satellite = layout.positions.satellite
    expect(satellite?.isSatellite).toBe(true)
    expect((satellite?.radius ?? 0) - (parent?.radius ?? 0)).toBeGreaterThan(0)
    expect((satellite?.radius ?? 0) - (parent?.radius ?? 0)).toBeLessThan(30)
    expect(Math.abs(shortestAngleDelta(parent?.angle ?? 0, satellite?.angle ?? 0))).toBeLessThan(0.1)
  })

  it('emits two-week rings plus an exact outer boundary', () => {
    const layout = createTemporalLayout(nodes, streams, { width: 900, height: 700 })
    expect(layout.rings.length).toBeGreaterThan(2)
    for (let index = 1; index < layout.rings.length - 1; index += 1) {
      const current = layout.rings[index]
      const previous = layout.rings[index - 1]
      expect(Date.parse(current?.date ?? '') - Date.parse(previous?.date ?? '')).toBe(TWO_WEEKS_MS)
    }
    expect(layout.rings.at(-1)?.radius).toBeCloseTo(layout.outerRadius)
  })

  it('uses an explicit linear time domain independently of visible-node extrema', () => {
    const timeDomain = {
      startMs: Date.parse('2026-01-01T00:00:00.000Z'),
      endMs: Date.parse('2026-01-31T23:59:59.999Z'),
    }
    const visible = [node('middle-only', 'east', '2026-01-16T12:00:00.000Z')]
    const layout = createTemporalLayout(visible, streams, {
      width: 900,
      height: 700,
      timeDomain,
    })

    expect(Date.parse(layout.minDate)).toBe(timeDomain.startMs)
    expect(Date.parse(layout.maxDate)).toBe(timeDomain.endMs)
    expect(layout.positions['middle-only']?.radius).toBeCloseTo(
      (layout.innerRadius + layout.outerRadius) / 2,
      0,
    )
  })

  it('chooses the densest non-crowded UTC cadence using real calendar months', () => {
    const domain = {
      startMs: Date.parse('2024-01-15T00:00:00.000Z'),
      endMs: Date.parse('2024-08-15T23:59:59.999Z'),
    }
    const { rings, cadence } = createAdaptiveTimeRings(domain, 40, 540, 42)
    const alignedMonths = rings
      .map((ring) => Date.parse(ring.date))
      .filter((value) => new Date(value).getUTCDate() === 1)
    const monthLengths = alignedMonths.slice(1).map((value, index) => value - (alignedMonths[index] as number))

    expect(ringCadenceKey(cadence)).toBe('1-month')
    expect(new Set(monthLengths).size).toBeGreaterThan(1)
    for (let index = 1; index < rings.length; index += 1) {
      expect((rings[index]?.radius ?? 0) - (rings[index - 1]?.radius ?? 0)).toBeGreaterThanOrEqual(42 - 0.001)
    }
  })

  it('maps clipped duration geometry to window edges without changing continuation truth', () => {
    const duration = node(
      'clipped-duration',
      'east',
      '2026-01-01T00:00:00.000Z',
      '2026-03-31T23:59:59.999Z',
    )
    const timeDomain = {
      startMs: Date.parse('2026-02-01T00:00:00.000Z'),
      endMs: Date.parse('2026-02-28T23:59:59.999Z'),
    }
    const layout = createTemporalLayout([duration], streams, {
      width: 900,
      height: 700,
      timeDomain,
      visibleIntervals: new Map([[
        duration.id,
        {
          startMs: timeDomain.startMs,
          endMs: timeDomain.endMs,
          continuesBefore: true,
          continuesAfter: true,
        },
      ]]),
    })
    const position = layout.positions[duration.id]

    expect(position?.startRadius).toBeCloseTo(layout.innerRadius)
    expect(position?.endRadius).toBeCloseTo(layout.outerRadius)
    expect(position?.continuesBefore).toBe(true)
    expect(position?.continuesAfter).toBe(true)
  })

  it('spends most of the temporal wheel on readable absolute-time separation', () => {
    const desktop = createTemporalLayout(nodes, streams, { width: 900, height: 700 })
    expect(desktop.innerRadius / desktop.outerRadius).toBeCloseTo(DEFAULT_INNER_RADIUS_RATIO)
    expect(desktop.outerRadius - desktop.innerRadius).toBeGreaterThan(desktop.outerRadius * 0.8)

    const mobile = createTemporalLayout(nodes, streams, { width: 390, height: 844 })
    expect(mobile.outerRadius).toBeGreaterThanOrEqual(165)
    expect(mobile.rings[1]?.radius).toBeGreaterThan(mobile.rings[0]?.radius ?? 0)
  })

  it('uses absolute canvas coordinates and applies pan, rotation, and bounded zoom deterministically', () => {
    const baseline = computeGraphLayout(nodes, streams, 800, 600)
    const moved = computeGraphLayout(nodes, streams, 800, 600, Math.PI / 2, 99, { x: 20, y: -10 })
    expect(baseline.center).toEqual({ x: 400, y: 300 })
    expect(moved.center).toEqual({ x: 420, y: 290 })
    expect(moved.outerRadius / baseline.outerRadius).toBeCloseTo(MAX_ZOOM)
    expect(moved.positions.old?.angle).toBeCloseTo(Math.PI / 2)
  })

  it('finds the shortest focus rotation across the wrap boundary', () => {
    const from = Math.PI - 0.05
    const to = -Math.PI + 0.05
    expect(shortestAngleDelta(from, to)).toBeCloseTo(0.1)
    const focused = rotationForFocusedStream(-2.8, 0.25)
    expect(shortestAngleDelta(-2.8 + focused, 0)).toBeCloseTo(0)
    expect(Math.abs(focused - 0.25)).toBeLessThanOrEqual(Math.PI)
  })

  it('can focus the exact selected branch angle rather than only its base stream lane', () => {
    const branch = { ...node('branch', 'east', '2026-02-20T00:00:00.000Z'), parentNodeId: 'old' }
    const layout = createTemporalLayout([...nodes, branch], streams, { width: 800, height: 600 })
    const position = layout.positions.branch
    expect(position).toBeDefined()
    expect(position?.angle).not.toBeCloseTo(streams[0]?.angle ?? 0)

    const currentRotation = Math.PI - 0.04
    const targetRotation = rotationForFocusedNode(position as NonNullable<typeof position>, currentRotation)
    expect(shortestAngleDelta(position?.angle as number + targetRotation, 0)).toBeCloseTo(0)
    expect(Math.abs(shortestAngleDelta(currentRotation, targetRotation))).toBeLessThanOrEqual(Math.PI)
    const focusedLayout = createTemporalLayout([...nodes, branch], streams, {
      width: 800,
      height: 600,
      rotationRadians: targetRotation,
    })
    expect(shortestAngleDelta(focusedLayout.positions.branch?.angle as number, 0)).toBeCloseTo(0)
    expect(rotationForFocusedStream(streams[1] as Workstream, currentRotation)).toBeCloseTo(
      rotationForFocusedStream(streams[1]?.angle as number, currentRotation),
    )
  })

  it('clamps zoom and maps a degenerate date range safely', () => {
    expect(clampZoom(-10)).toBe(MIN_ZOOM)
    expect(clampZoom(20)).toBe(MAX_ZOOM)
    expect(clampInnerRadiusRatio(-10)).toBe(0.08)
    expect(clampInnerRadiusRatio(10)).toBe(0.32)
    expect(dateToRadius(5, 5, 5, 10, 30)).toBe(20)
  })

  it('supports bounded hit testing and lasso helpers', () => {
    expect(distanceToSegment({ x: 2, y: 3 }, { x: 0, y: 0 }, { x: 4, y: 0 })).toBeCloseTo(3)
    expect(pointInPolygon({ x: 2, y: 2 }, [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 4 }, { x: 0, y: 4 }])).toBe(true)
    expect(pointInPolygon({ x: 5, y: 2 }, [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 4 }, { x: 0, y: 4 }])).toBe(false)

    const layout = computeGraphLayout(nodes, streams, 800, 600)
    const old = layout.positions.old
    expect(old).toBeDefined()
    expect(nodesInRect(layout.positions, { x: (old?.x ?? 0) - 1, y: (old?.y ?? 0) - 1, width: 2, height: 2 })).toEqual(['old'])
  })
})

describe('bounded deterministic force relaxation', () => {
  const clusteredNodes = [
    node('cluster-a', 'east', '2026-02-01T00:00:00.000Z'),
    node('cluster-b', 'east', '2026-02-01T00:00:00.000Z'),
    node('cluster-c', 'east', '2026-02-01T00:00:00.000Z'),
    node('cluster-d', 'east', '2026-02-01T00:00:00.000Z'),
    node('old-reference', 'south', '2026-01-01T00:00:00.000Z'),
    node('lane-reference', 'south', '2026-03-01T00:00:00.000Z'),
  ]
  const clusteredLayout = createTemporalLayout(clusteredNodes, streams, { width: 1_000, height: 800 })
  const relaxationOptions = {
    collisionRadius: 3,
    collisionPadding: 2,
    repulsionStrength: 0.5,
  } as const

  it('improves overlap using bounded tangential motion while every semantic radius stays exact', () => {
    const domainBefore = structuredClone(clusteredNodes)
    const layoutBefore = structuredClone(clusteredLayout)
    const initial = createForceRelaxation(clusteredLayout, clusteredNodes, relaxationOptions)
    const settled = runForceRelaxationToStop(initial)
    const relaxedLayout = applyForceRelaxation(clusteredLayout, settled)

    expect(initial.overlapCount).toBeGreaterThan(0)
    expect(settled.totalOverlap).toBeLessThan(initial.totalOverlap)
    expect(settled.overlapCount).toBeLessThan(initial.overlapCount)
    for (const source of clusteredNodes) {
      const anchor = clusteredLayout.positions[source.id]
      const relaxed = relaxedLayout.positions[source.id]
      const physics = settled.nodes[source.id]
      expect(anchor).toBeDefined()
      expect(relaxed?.radius).toBe(anchor?.radius)
      expect(relaxed?.startRadius).toBe(anchor?.startRadius)
      expect(relaxed?.endRadius).toBe(anchor?.endRadius)
      expect(Math.hypot((relaxed?.x ?? 0) - relaxedLayout.center.x, (relaxed?.y ?? 0) - relaxedLayout.center.y)).toBeCloseTo(
        anchor?.endRadius ?? 0,
        8,
      )
      expect(Math.abs(physics?.angleOffset ?? 0)).toBeLessThanOrEqual(physics?.maxAngleOffset ?? 0)
      expect(physics?.maxAngleOffset).toBeLessThanOrEqual(0.24)
      expect(physics?.maxAngleOffset).toBeLessThanOrEqual(30 / Math.max(1, physics?.anchorRadius ?? 1))
    }
    expect(clusteredNodes).toEqual(domainBefore)
    expect(clusteredLayout).toEqual(layoutBefore)
  })

  it('is exactly deterministic regardless of domain input ordering', () => {
    const forward = runForceRelaxationToStop(createForceRelaxation(clusteredLayout, clusteredNodes, relaxationOptions))
    const reversed = runForceRelaxationToStop(createForceRelaxation(clusteredLayout, [...clusteredNodes].reverse(), relaxationOptions))
    expect(reversed).toEqual(forward)
  })

  it('reports threshold convergence and a distinct hard max-step stop', () => {
    const singleNode = [node('only', 'east', '2026-02-01T00:00:00.000Z')]
    const singleLayout = createTemporalLayout(singleNode, streams, { width: 600, height: 500 })
    const converged = runForceRelaxationToStop(createForceRelaxation(singleLayout, singleNode))
    expect(converged).toMatchObject({
      stopped: true,
      converged: true,
      stopReason: 'converged',
      step: 12,
      maxMotion: 0,
      maxSpeed: 0,
    })

    const limited = stepForceRelaxation(
      createForceRelaxation(clusteredLayout, clusteredNodes, {
        ...relaxationOptions,
        stableStepsRequired: 100,
        maxSteps: 2,
      }),
      20,
    )
    expect(limited).toMatchObject({ stopped: true, converged: false, stopReason: 'max-steps', step: 2 })
    expect(limited.totalOverlap).toBeGreaterThan(limited.options.overlapTolerance)
    expect(limited.glyphTotalOverlap).toBeGreaterThan(limited.options.overlapTolerance)
  })

  it('uses a duration midpoint for motion and the exact radial capsule for collision distance', () => {
    const durationNodes = [
      node('long-duration', 'east', '2026-01-01T00:00:00.000Z', '2026-03-01T00:00:00.000Z'),
      node('midpoint-peer', 'east', '2026-01-10T12:00:00.000Z'),
      node('duration-other-lane', 'south', '2026-03-01T00:00:00.000Z'),
    ]
    const layout = createTemporalLayout(durationNodes, streams, { width: 900, height: 700 })
    const initial = createForceRelaxation(layout, durationNodes, { maxSteps: 24 })
    const capsule = initial.nodes['long-duration']
    const position = layout.positions['long-duration']
    const expectedMidpointRadius = ((position?.startRadius ?? 0) + (position?.endRadius ?? 0)) / 2
    expect(capsule?.anchorRadius).toBeCloseTo(expectedMidpointRadius)
    expect(Math.hypot(
      (capsule?.anchorX ?? 0) - layout.center.x,
      (capsule?.anchorY ?? 0) - layout.center.y,
    )).toBeCloseTo(expectedMidpointRadius)
    expect(capsule?.collisionRadius).toBe(initial.options.collisionRadius)
    expect(createForceRelaxation(layout, durationNodes, {
      collisionRadii: { 'long-duration': 9 },
    }).nodes['long-duration']?.collisionRadius).toBe(9)
    expect(initial.overlapCount).toBeGreaterThan(0)

    const peer = initial.nodes['midpoint-peer']
    expect(peer).toBeDefined()
    expect(Math.hypot(
      (capsule?.x ?? 0) - (peer?.x ?? 0),
      (capsule?.y ?? 0) - (peer?.y ?? 0),
    )).toBeGreaterThan((capsule?.collisionRadius ?? 0) + (peer?.collisionRadius ?? 0))
    expect(initial.maximumGlyphOverlap).toBeGreaterThan(0)

    const stopped = runForceRelaxationToStop(initial)
    const applied = applyForceRelaxation(layout, stopped).positions['long-duration']
    expect(Math.hypot(
      (applied?.startX ?? 0) - layout.center.x,
      (applied?.startY ?? 0) - layout.center.y,
    )).toBeCloseTo(position?.startRadius ?? 0, 8)
    expect(Math.hypot(
      (applied?.endX ?? 0) - layout.center.x,
      (applied?.endY ?? 0) - layout.center.y,
    )).toBeCloseTo(position?.endRadius ?? 0, 8)
  })

  it('keeps focus choice explicit for semantic anchors and relaxed endpoints', () => {
    const settled = runForceRelaxationToStop(createForceRelaxation(clusteredLayout, clusteredNodes, relaxationOptions))
    const anchor = clusteredLayout.positions['cluster-a']
    const relaxed = settled.nodes['cluster-a']
    expect(anchor).toBeDefined()
    expect(relaxed).toBeDefined()
    expect(relaxed?.angleOffset).not.toBe(0)

    const anchorRotation = rotationForFocusedNode(anchor as NonNullable<typeof anchor>, 2.9)
    expect(shortestAngleDelta((anchor?.angle ?? 0) + anchorRotation, 0)).toBeCloseTo(0)
    const relaxedRotation = rotationForFocusedRelaxedNode(
      relaxed as NonNullable<typeof relaxed>,
      settled.center,
      2.9,
    )
    expect(shortestAngleDelta((relaxed?.renderAngle ?? 0) + relaxedRotation, 0)).toBeCloseTo(0)
  })

  it('exposes a stable restart key for viewport and membership changes', () => {
    const state = createForceRelaxation(clusteredLayout, clusteredNodes, relaxationOptions)
    expect(shouldRestartForceRelaxation(state, clusteredLayout, clusteredNodes, relaxationOptions)).toBe(false)

    const resized = createTemporalLayout(clusteredNodes, streams, { width: 900, height: 700 })
    expect(shouldRestartForceRelaxation(state, resized, clusteredNodes, relaxationOptions)).toBe(true)
    expect(shouldRestartForceRelaxation(state, clusteredLayout, clusteredNodes.slice(0, -1), relaxationOptions)).toBe(true)
  })

  it('retargets changed force fields from the rendered snapshot without mutation or anchor snapping', () => {
    const previous = stepForceRelaxation(
      createForceRelaxation(clusteredLayout, clusteredNodes, relaxationOptions),
      5,
    )
    const previousBefore = structuredClone(previous)
    const domainBefore = structuredClone(clusteredNodes)
    const layoutBefore = structuredClone(clusteredLayout)
    const selectedOptions = {
      ...relaxationOptions,
      collisionRadii: { 'cluster-a': 14, 'cluster-b': 8 },
      pinnedOffsets: { 'cluster-a': { angleOffset: 0.1 } },
    }
    const warmed = retargetForceRelaxation(
      previous,
      clusteredLayout,
      [...clusteredNodes].reverse(),
      selectedOptions,
    )
    const repeated = retargetForceRelaxation(
      previous,
      clusteredLayout,
      clusteredNodes,
      selectedOptions,
    )

    expect(warmed).toEqual(repeated)
    expect(warmed.layoutKey).not.toBe(previous.layoutKey)
    expect(warmed.nodes['cluster-a']).toMatchObject({ pinned: true, targetAngleOffset: 0.1 })
    expect(warmed).toMatchObject({
      step: 0,
      alpha: 1,
      stableSteps: 0,
      stopped: false,
      converged: false,
      stopReason: 'running',
    })
    expect(Object.values(previous.nodes).some((physicsNode) => Math.abs(physicsNode.angleOffset) > 1e-5)).toBe(true)
    for (const [nodeId, physicsNode] of Object.entries(warmed.nodes)) {
      const prior = previous.nodes[nodeId]
      expect(prior).toBeDefined()
      expect(physicsNode.angleOffset).toBeCloseTo(
        Math.min(physicsNode.maxAngleOffset, Math.max(-physicsNode.maxAngleOffset, prior?.angleOffset ?? 0)),
        10,
      )
      expect(physicsNode.x).toBeCloseTo(prior?.x ?? 0, 8)
      expect(physicsNode.y).toBeCloseTo(prior?.y ?? 0, 8)
    }

    const added = node('cluster-added', 'east', '2026-02-02T00:00:00.000Z')
    const expandedNodes = [...clusteredNodes, added]
    const expandedLayout = createTemporalLayout(expandedNodes, streams, { width: 1_000, height: 800 })
    const expanded = retargetForceRelaxation(previous, expandedLayout, expandedNodes, selectedOptions)
    expect(expanded.nodes['cluster-added']).toMatchObject({ angleOffset: 0, radialOffset: 0 })
    const reduced = retargetForceRelaxation(previous, clusteredLayout, clusteredNodes.slice(1), selectedOptions)
    expect(reduced.nodes['cluster-a']).toBeUndefined()

    expect(previous).toEqual(previousBefore)
    expect(clusteredNodes).toEqual(domainBefore)
    expect(clusteredLayout).toEqual(layoutBefore)
  })

  it('clamps manual pins, preserves exact primary radii, and packs unpinned peers around them', () => {
    const domainBefore = structuredClone(clusteredNodes)
    const layoutBefore = structuredClone(clusteredLayout)
    const pinned = createForceRelaxation(clusteredLayout, clusteredNodes, {
      ...relaxationOptions,
      pinnedOffsets: {
        'cluster-b': { angleOffset: 99, radialOffset: 99 },
      },
    })
    const pinnedNode = pinned.nodes['cluster-b']
    expect(pinnedNode?.pinned).toBe(true)
    expect(clampManualNodeOffset(
      pinnedNode as NonNullable<typeof pinnedNode>,
      { angleOffset: 99, radialOffset: 99 },
    )).toEqual({ angleOffset: pinnedNode?.maxAngleOffset })
    expect(pinnedNode?.targetAngleOffset).toBe(pinnedNode?.maxAngleOffset)
    expect(pinnedNode?.targetRadialOffset).toBe(0)

    const settled = runForceRelaxationToStop(pinned)
    const applied = applyForceRelaxation(clusteredLayout, settled)
    expect(settled.nodes['cluster-b']?.angleOffset).toBeCloseTo(pinnedNode?.targetAngleOffset ?? 0, 4)
    expect(settled.maximumGlyphOverlap).toBeLessThanOrEqual(settled.options.overlapTolerance)
    expect(applied.positions['cluster-b']?.startRadius).toBe(clusteredLayout.positions['cluster-b']?.startRadius)
    expect(applied.positions['cluster-b']?.endRadius).toBe(clusteredLayout.positions['cluster-b']?.endRadius)
    expect(Object.values(settled.nodes).some((physicsNode) =>
      physicsNode.nodeId !== 'cluster-b' && Math.abs(physicsNode.targetAngleOffset) > 1e-4)).toBe(true)

    const satelliteNodes = [
      node('pin-parent', 'east', '2026-01-01T00:00:00.000Z'),
      node('pin-satellite', 'east', '2026-01-02T00:00:00.000Z', undefined, 'pin-parent'),
      node('pin-peer', 'south', '2026-02-01T00:00:00.000Z'),
    ]
    const satelliteLayout = createTemporalLayout(satelliteNodes, streams, { width: 800, height: 600 })
    const satellitePinned = createForceRelaxation(satelliteLayout, satelliteNodes, {
      pinnedOffsets: { 'pin-satellite': { angleOffset: -99, radialOffset: 99 } },
    })
    const satellite = satellitePinned.nodes['pin-satellite']
    expect(satellite).toMatchObject({ pinned: true, targetRadialOffset: 14 })
    expect(satellite?.targetAngleOffset).toBe(-(satellite?.maxAngleOffset ?? 0))

    expect(clusteredNodes).toEqual(domainBefore)
    expect(clusteredLayout).toEqual(layoutBefore)
  })

  it('keeps a satellite in its bounded parent-relative orbit', () => {
    const relationshipNodes = [
      node('parent', 'east', '2026-01-01T00:00:00.000Z'),
      node('peer', 'east', '2026-01-01T00:00:00.000Z'),
      node('sat', 'east', '2026-01-02T00:00:00.000Z', undefined, 'parent'),
      node('other-lane', 'south', '2026-02-01T00:00:00.000Z'),
    ]
    const layout = createTemporalLayout(relationshipNodes, streams, { width: 800, height: 600 })
    const settled = runForceRelaxationToStop(createForceRelaxation(layout, relationshipNodes))
    const relaxedLayout = applyForceRelaxation(layout, settled)
    const parent = relaxedLayout.positions.parent
    const satellite = relaxedLayout.positions.sat
    const anchorDistance = Math.hypot(
      (layout.positions.sat?.x ?? 0) - (layout.positions.parent?.x ?? 0),
      (layout.positions.sat?.y ?? 0) - (layout.positions.parent?.y ?? 0),
    )
    const relaxedDistance = Math.hypot(
      (satellite?.x ?? 0) - (parent?.x ?? 0),
      (satellite?.y ?? 0) - (parent?.y ?? 0),
    )
    expect(Math.hypot((satellite?.x ?? 0) - layout.center.x, (satellite?.y ?? 0) - layout.center.y)).toBeCloseTo(
      layout.positions.sat?.radius ?? 0,
      8,
    )
    expect(relaxedDistance).toBeLessThan(anchorDistance + layout.outerRadius * 0.12)
  })

  it('eliminates true glyph overlap in the complete fixture at desktop and mobile bounds', () => {
    const domainBefore = structuredClone(WORK_NODES)
    const collisionRadii = Object.fromEntries(WORK_NODES.map((fixtureNode) => [
      fixtureNode.id,
      fixtureNode.satelliteOfNodeId
        ? 4.5
        : fixtureNode.endedAt
          ? 9
          : fixtureNode.type === 'decision'
            ? 7.5
            : 8.5,
    ]))
    const viewports = [
      { width: 848, height: 904, maximumPaddedPenetration: 0.05 },
      { width: 1_280, height: 720, maximumPaddedPenetration: 0.05 },
      { width: 390, height: 844, maximumPaddedPenetration: 3.5 },
    ]

    for (const viewport of viewports) {
      const layout = createTemporalLayout(WORK_NODES, WORKSTREAMS, viewport)
      const initial = createForceRelaxation(layout, WORK_NODES, {
        collisionPadding: 4,
        collisionRadii,
      })
      const settled = runForceRelaxationToStop(initial)
      const applied = applyForceRelaxation(layout, settled)

      expect(initial.initialGlyphOverlapCount).toBeGreaterThan(0)
      expect(settled).toMatchObject({ stopped: true, converged: true, stopReason: 'converged' })
      expect(settled.step).toBeLessThan(180)
      expect(settled.maximumGlyphOverlap).toBeLessThanOrEqual(0.001)
      expect(settled.glyphOverlapCount).toBe(0)
      expect(settled.maximumOverlap).toBeLessThanOrEqual(viewport.maximumPaddedPenetration)
      expect(settled.maxMotion).toBeLessThan(0.05)
      expect(settled.maxSpeed).toBeLessThan(0.02)

      for (const fixtureNode of WORK_NODES) {
        const physics = settled.nodes[fixtureNode.id]
        const anchor = layout.positions[fixtureNode.id]
        const relaxed = applied.positions[fixtureNode.id]
        expect(Math.abs(physics?.angleOffset ?? 0)).toBeLessThanOrEqual((physics?.maxAngleOffset ?? 0) + 1e-8)
        expect(physics?.maxAngleOffset).toBeLessThanOrEqual(0.24)
        if (fixtureNode.satelliteOfNodeId) {
          expect(Math.abs(physics?.radialOffset ?? 0)).toBeLessThanOrEqual(14)
        } else {
          expect(physics?.radialOffset).toBe(0)
          expect(relaxed?.startRadius).toBe(anchor?.startRadius)
          expect(relaxed?.endRadius).toBe(anchor?.endRadius)
        }
      }

      if (viewport.width === 390) {
        expect(settled.totalOverlap).toBeGreaterThan(settled.options.overlapTolerance)
      }
    }
    expect(WORK_NODES).toEqual(domainBefore)
  })

  it('separates visible glyph radii from enlarged selection influence fields', () => {
    const glyphRadii = Object.fromEntries(WORK_NODES.map((fixtureNode) => [
      fixtureNode.id,
      fixtureNode.satelliteOfNodeId
        ? 4.5
        : fixtureNode.endedAt
          ? 9
          : fixtureNode.type === 'decision'
            ? 7.5
            : 8.5,
    ]))
    const collisionRadii = Object.fromEntries(Object.entries(glyphRadii).map(([nodeId, radius]) => [
      nodeId,
      radius + (nodeId === 'node-renderer-failure' ? 10 : 0),
    ]))
    const layout = createTemporalLayout(WORK_NODES, WORKSTREAMS, { width: 390, height: 844 })
    const settled = runForceRelaxationToStop(createForceRelaxation(layout, WORK_NODES, {
      collisionPadding: 4,
      collisionRadii,
      glyphRadii,
    }))

    expect(settled).toMatchObject({ stopped: true, converged: true, stopReason: 'converged' })
    expect(settled.glyphOverlapCount).toBe(0)
    expect(settled.maximumGlyphOverlap).toBe(0)
    expect(settled.maximumOverlap).toBeGreaterThan(settled.maximumGlyphOverlap)
    expect(settled.nodes['node-renderer-failure']).toMatchObject({ collisionRadius: 19, glyphRadius: 9 })
  })

  it('eliminates glyph and duration-capsule overlap in the exact selected mobile canvas scene', () => {
    const initialState = createInitialState()
    const stateBefore = structuredClone(initialState)
    const displayNodes = selectVisibleNodes(initialState)
    const displayNodeIds = new Set(displayNodes.map((fixtureNode) => fixtureNode.id))
    // The initial group is expanded, so the repaired runtime display topology is
    // exactly every canonical relation whose endpoints remain in the display set.
    // Layer flags are presentation state and intentionally do not participate.
    const topologyRelations = initialState.relations.filter((relation) =>
      displayNodeIds.has(relation.sourceNodeId)
      && displayNodeIds.has(relation.targetNodeId),
    )
    const domainBefore = structuredClone(displayNodes)
    const selectedNodeId = initialState.selectedNodeId as string
    const adjacency = new Map(displayNodes.map((fixtureNode) => [fixtureNode.id, new Set<string>()]))
    const connect = (left: string, right: string) => {
      if (left === right || !adjacency.has(left) || !adjacency.has(right)) return
      adjacency.get(left)?.add(right)
      adjacency.get(right)?.add(left)
    }
    for (const relation of topologyRelations) connect(relation.sourceNodeId, relation.targetNodeId)
    const nodesByStream = new Map<string, WorkNode[]>()
    for (const fixtureNode of displayNodes) {
      nodesByStream.set(fixtureNode.workstreamId, [
        ...(nodesByStream.get(fixtureNode.workstreamId) ?? []),
        fixtureNode,
      ])
    }
    for (const lane of nodesByStream.values()) {
      lane.sort((left, right) => Date.parse(left.startedAt) - Date.parse(right.startedAt) || left.id.localeCompare(right.id))
      for (let index = 1; index < lane.length; index += 1) {
        connect(lane[index - 1]?.id ?? '', lane[index]?.id ?? '')
      }
    }
    const distances = new Map<string, 0 | 1 | 2>([[selectedNodeId, 0]])
    const queue: Array<{ nodeId: string; distance: 0 | 1 | 2 }> = [{ nodeId: selectedNodeId, distance: 0 }]
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const current = queue[cursor]
      if (!current || current.distance >= 2) continue
      const nextDistance = (current.distance + 1) as 1 | 2
      for (const neighbor of [...(adjacency.get(current.nodeId) ?? [])].sort()) {
        if (distances.has(neighbor)) continue
        distances.set(neighbor, nextDistance)
        queue.push({ nodeId: neighbor, distance: nextDistance })
      }
    }
    expect(displayNodes).toHaveLength(32)
    expect(topologyRelations).toHaveLength(33)
    expect(selectedNodeId).toBe('node-renderer-failure')
    expect([...distances.values()].filter((distance) => distance === 0)).toHaveLength(1)
    expect([...distances.values()].filter((distance) => distance === 1)).toHaveLength(6)
    expect([...distances.values()].filter((distance) => distance === 2)).toHaveLength(8)
    const glyphRadii = Object.fromEntries(displayNodes.map((fixtureNode) => [
      fixtureNode.id,
      fixtureNode.satelliteOfNodeId
        ? 4.5
        : fixtureNode.endedAt
          ? 9
          : fixtureNode.type === 'decision'
            ? 7.5
            : 8.5,
    ]))
    const collisionRadii = Object.fromEntries(Object.entries(glyphRadii).map(([nodeId, radius]) => {
      const distance = distances.get(nodeId)
      return [nodeId, radius + (distance === 0 ? 10 : distance === 1 ? 5 : distance === 2 ? 2 : 0)]
    }))
    const layout = createTemporalLayout(displayNodes, initialState.workstreams, {
      width: 390,
      height: 722,
      padding: 30,
    })
    const relaxationOptions = {
      collisionPadding: 4,
      collisionRadii,
      glyphRadii,
      pinnedOffsets: initialState.manualNodeOffsets,
    }
    expect(forceRelaxationKey(layout, displayNodes, relaxationOptions)).toBe('relax-6f28f633')
    const settled = runForceRelaxationToStop(
      createForceRelaxation(layout, displayNodes, relaxationOptions),
    )
    const applied = applyForceRelaxation(layout, settled)
    const physicsNodes = Object.values(settled.nodes).sort((left, right) => left.nodeId.localeCompare(right.nodeId))
    const residualPairs: Array<{
      pair: string
      penetration: number
      left: { angleOffset: number; targetAngleOffset: number; maxAngleOffset: number; radialOffset: number; targetRadialOffset: number }
      right: { angleOffset: number; targetAngleOffset: number; maxAngleOffset: number; radialOffset: number; targetRadialOffset: number }
    }> = []
    for (let leftIndex = 0; leftIndex < physicsNodes.length; leftIndex += 1) {
      const left = physicsNodes[leftIndex]
      if (!left) continue
      for (let rightIndex = leftIndex + 1; rightIndex < physicsNodes.length; rightIndex += 1) {
        const right = physicsNodes[rightIndex]
        if (!right) continue
        const penetration = forceGlyphPairPenetration(left, right)
        if (penetration > 0.001) residualPairs.push({
          pair: `${left.nodeId}<->${right.nodeId}`,
          penetration: Number(penetration.toFixed(6)),
          left: {
            angleOffset: left.angleOffset,
            targetAngleOffset: left.targetAngleOffset,
            maxAngleOffset: left.maxAngleOffset,
            radialOffset: left.radialOffset,
            targetRadialOffset: left.targetRadialOffset,
          },
          right: {
            angleOffset: right.angleOffset,
            targetAngleOffset: right.targetAngleOffset,
            maxAngleOffset: right.maxAngleOffset,
            radialOffset: right.radialOffset,
            targetRadialOffset: right.targetRadialOffset,
          },
        })
      }
    }

    expect(residualPairs).toEqual([])
    expect(settled).toMatchObject({ stopped: true, converged: true, stopReason: 'converged' })
    expect(settled.step).toBeLessThan(180)
    expect(settled.glyphOverlapCount).toBe(0)
    expect(settled.maximumGlyphOverlap).toBe(0)
    expect(settled.glyphTotalOverlap).toBe(0)
    expect(settled.nodes[selectedNodeId]).toMatchObject({ collisionRadius: 19, glyphRadius: 9 })
    expect(settled.nodes['satellite-label-figure']).toMatchObject({ collisionRadius: 9.5, glyphRadius: 4.5 })
    for (const fixtureNode of displayNodes) {
      const physics = settled.nodes[fixtureNode.id]
      const semantic = layout.positions[fixtureNode.id]
      const rendered = applied.positions[fixtureNode.id]
      expect(Math.abs(physics?.angleOffset ?? 0)).toBeLessThanOrEqual((physics?.maxAngleOffset ?? 0) + 1e-8)
      expect(physics?.maxAngleOffset).toBeLessThanOrEqual(0.24)
      expect(physics?.maxAngleOffset).toBeLessThanOrEqual(30 / Math.max(1, physics?.anchorRadius ?? 1))
      if (fixtureNode.satelliteOfNodeId) {
        expect(Math.abs(physics?.radialOffset ?? 0)).toBeLessThanOrEqual(14)
      } else {
        expect(physics?.radialOffset).toBe(0)
        expect(rendered?.startRadius).toBe(semantic?.startRadius)
        expect(rendered?.endRadius).toBe(semantic?.endRadius)
      }
    }
    expect(displayNodes).toEqual(domainBefore)
    expect(initialState).toEqual(stateBefore)
  })
})
