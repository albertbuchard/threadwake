import { describe, expect, it } from 'vitest'

import {
  DEFAULT_GRAPH_TRANSITION_DURATION_MS,
  ENTER_SCALE,
  EXIT_SCALE,
  GraphTransitionCoordinator,
  MAX_GRAPH_TRANSITION_DURATION_MS,
  graphBindingId,
  type GraphBindingKind,
  type GraphBindingTarget,
} from './graph-transition'

const boundary = {
  centerX: 0,
  centerY: 0,
  innerRadius: 10,
  outerRadius: 100,
} as const

function target(
  kind: GraphBindingKind,
  stableId: string,
  x: number,
  y = 0,
  overrides: Partial<GraphBindingTarget> = {},
): GraphBindingTarget {
  return {
    id: graphBindingId(kind, stableId),
    kind,
    channels: { x, y },
    ...overrides,
  }
}

function binding(frame: ReturnType<GraphTransitionCoordinator['sample']>, id: string) {
  const found = frame.bindings.find((candidate) => candidate.id === id)
  expect(found, `${id} should be retained in the sampled frame`).toBeDefined()
  return found as NonNullable<typeof found>
}

describe('GraphTransitionCoordinator', () => {
  it('initializes immutable IDs for every retained scene binding class', () => {
    const kinds: GraphBindingKind[] = ['node', 'relation', 'group', 'ring', 'label', 'hit-target']
    const targets = kinds.map((kind, index) => target(kind, `fixture-${index}`, 20 + index))
    const coordinator = new GraphTransitionCoordinator()
    const frame = coordinator.initialize(targets, 5)

    expect(frame.bindings.map((item) => item.id)).toEqual(
      kinds.map((kind, index) => `${kind}:fixture-${index}`).sort(),
    )
    expect(frame.bindings.every((item) => item.phase === 'settled')).toBe(true)
    expect(frame.diagnostics).toMatchObject({
      queuedPreviewFrames: 0,
      activeTransitions: 0,
      supersededBindings: 0,
      cumulativeSupersededBindings: 0,
      destroyedBindingCount: 0,
      listenerCount: 0,
      tickerCount: 0,
      timerCount: 0,
    })
    expect(coordinator.assertTerminalCounts()).toMatchObject({
      retainedBindingCount: 6,
      expectedRetainedBindingCount: 6,
    })
  })

  it('coalesces previews and caps the one active normal transition at 320 milliseconds', () => {
    const id = graphBindingId('node', 'one')
    const coordinator = new GraphTransitionCoordinator()
    coordinator.initialize([target('node', 'one', 20)], 0)
    coordinator.retarget([target('node', 'one', 40)], { durationMs: 900 })
    coordinator.retarget([target('node', 'one', 80)], { durationMs: 900 })

    expect(coordinator.diagnostics().queuedPreviewFrames).toBe(1)
    const first = coordinator.sample(0)
    expect(binding(first, id).channels.x).toBe(20)
    expect(first.diagnostics).toMatchObject({ queuedPreviewFrames: 0, activeTransitions: 1 })

    const almost = coordinator.sample(MAX_GRAPH_TRANSITION_DURATION_MS - 1)
    expect(almost.settled).toBe(false)
    expect(binding(almost, id).channels.x).toBeLessThan(80)

    const final = coordinator.sample(MAX_GRAPH_TRANSITION_DURATION_MS)
    expect(final.settled).toBe(true)
    expect(binding(final, id).channels.x).toBe(80)
    expect(DEFAULT_GRAPH_TRANSITION_DURATION_MS).toBe(MAX_GRAPH_TRANSITION_DURATION_MS)
    expect(coordinator.assertTerminalCounts()).toMatchObject({ activeTransitions: 0, queuedPreviewFrames: 0 })
  })

  it('warm-starts interruption from the current sample without snap-back', () => {
    const id = graphBindingId('node', 'survivor')
    const coordinator = new GraphTransitionCoordinator()
    coordinator.initialize([target('node', 'survivor', 20)], 0)
    coordinator.retarget([target('node', 'survivor', 100)], { durationMs: 320 })
    coordinator.sample(0)
    const midpoint = coordinator.sample(160)
    expect(binding(midpoint, id).channels.x).toBe(60)

    coordinator.retarget([target('node', 'survivor', 40)], { durationMs: 320 })
    const retargeted = coordinator.sample(160)
    expect(binding(retargeted, id).channels.x).toBe(60)
    expect(binding(retargeted, id).phase).toBe('surviving')
    expect(retargeted.diagnostics.supersededBindings).toBe(1)
    expect(retargeted.diagnostics.cumulativeSupersededBindings).toBe(1)
    expect(retargeted.diagnostics.activeTransitions).toBe(1)

    const settled = coordinator.sample(480)
    expect(binding(settled, id).channels.x).toBe(40)
    expect(settled.diagnostics).toMatchObject({
      activeTransitions: 0,
      queuedPreviewFrames: 0,
      supersededBindings: 0,
      cumulativeSupersededBindings: 1,
      listenerCount: 0,
      tickerCount: 0,
      timerCount: 0,
    })
    expect(coordinator.assertTerminalCounts()).toMatchObject({
      retainedBindingCount: 1,
      destroyedExitBindingCount: 0,
      supersededBindings: 0,
      listenerCount: 0,
      tickerCount: 0,
      timerCount: 0,
    })
  })

  it('enters and exits at the governed radial sides and disables exits immediately', () => {
    const exitingId = graphBindingId('node', 'future-hidden')
    const enteringId = graphBindingId('label', 'newly-visible')
    const coordinator = new GraphTransitionCoordinator()
    coordinator.initialize([target('node', 'future-hidden', 80)], 0)
    coordinator.retarget(
      [target('label', 'newly-visible', 35, 0, { entryBoundary: 'inner' })],
      {
        radialBoundary: boundary,
        exitBoundaryById: { [exitingId]: 'outer' as const },
      },
    )

    const first = coordinator.sample(0)
    const entering = binding(first, enteringId)
    const exiting = binding(first, exitingId)
    expect(entering).toMatchObject({ phase: 'entering', opacity: 0, scale: ENTER_SCALE })
    expect(entering.channels.x).toBe(10)
    expect(exiting).toMatchObject({ phase: 'exiting', interactive: false, opacity: 1, scale: 1 })

    const middle = coordinator.sample(160)
    expect(binding(middle, enteringId).channels.x).toBeCloseTo(22.5)
    expect(binding(middle, exitingId).channels.x).toBeCloseTo(90)
    expect(binding(middle, exitingId).scale).toBeCloseTo((1 + EXIT_SCALE) / 2)

    const final = coordinator.sample(320)
    expect(final.bindings.map((item) => item.id)).toEqual([enteringId])
    expect(final.destroyedBindingIds).toEqual([exitingId])
    expect(final.diagnostics.destroyedBindingCount).toBe(1)
    expect(coordinator.sample(640).destroyedBindingIds).toEqual([])
    expect(coordinator.diagnostics().destroyedBindingCount).toBe(1)
    expect(coordinator.assertTerminalCounts()).toMatchObject({
      destroyedExitBindingCount: 1,
      expectedDestroyedExitBindingCount: 1,
    })
  })

  it('projects every declared route point and uses the nearer boundary when no side is supplied', () => {
    const routeId = graphBindingId('relation', 'route')
    const coordinator = new GraphTransitionCoordinator()
    coordinator.initialize([], 0)
    coordinator.retarget([
      {
        id: routeId,
        kind: 'relation',
        channels: {
          sourceX: 12,
          sourceY: 0,
          controlX: 90,
          controlY: 0,
          targetX: 70,
          targetY: 0,
        },
        radialPoints: [
          ['sourceX', 'sourceY'],
          ['controlX', 'controlY'],
          ['targetX', 'targetY'],
        ],
      },
    ], { radialBoundary: boundary })

    const first = coordinator.sample(0)
    expect(binding(first, routeId).channels).toMatchObject({
      sourceX: 10,
      controlX: 100,
      targetX: 100,
    })
    const final = coordinator.sample(320)
    expect(binding(final, routeId).channels).toMatchObject({
      sourceX: 12,
      controlX: 90,
      targetX: 70,
    })
  })

  it('settles reduced motion in one coherent sample and destroys each exit once', () => {
    const oldId = graphBindingId('hit-target', 'old')
    const newId = graphBindingId('hit-target', 'new')
    const coordinator = new GraphTransitionCoordinator()
    coordinator.initialize([target('hit-target', 'old', 30)], 0)
    coordinator.retarget(
      [target('hit-target', 'new', 70, 0, { entryBoundary: 'outer' })],
      {
        reducedMotion: true,
        radialBoundary: boundary,
        exitBoundaryById: { [oldId]: 'inner' as const },
      },
    )

    expect(coordinator.diagnostics()).toMatchObject({ queuedPreviewFrames: 1, activeTransitions: 0 })
    const frame = coordinator.sample(16)
    expect(frame.settled).toBe(true)
    expect(frame.bindings).toHaveLength(1)
    expect(binding(frame, newId)).toMatchObject({ phase: 'settled', opacity: 1, scale: 1, interactive: true })
    expect(frame.destroyedBindingIds).toEqual([oldId])
    expect(frame.diagnostics).toMatchObject({ queuedPreviewFrames: 0, activeTransitions: 0 })
    expect(coordinator.sample(32).destroyedBindingIds).toEqual([])
    expect(coordinator.assertTerminalCounts({
      retainedBindingCount: 1,
      destroyedExitBindingCount: 1,
    })).toMatchObject({
      expectedRetainedBindingCount: 1,
      expectedDestroyedExitBindingCount: 1,
    })
  })

  it('revives an interrupted exit as the same retained instance without stale destruction', () => {
    const id = graphBindingId('node', 'revived')
    const coordinator = new GraphTransitionCoordinator()
    const initial = coordinator.initialize([target('node', 'revived', 80)], 0)
    const initialInstance = binding(initial, id).instance

    coordinator.retarget([], {
      radialBoundary: boundary,
      exitBoundaryById: { [id]: 'outer' as const },
    })
    coordinator.sample(0)
    const partialExit = coordinator.sample(160)
    expect(binding(partialExit, id)).toMatchObject({
      instance: initialInstance,
      phase: 'exiting',
      interactive: false,
    })

    coordinator.retarget([target('node', 'revived', 60)], { radialBoundary: boundary })
    const revived = coordinator.sample(160)
    expect(binding(revived, id)).toMatchObject({
      instance: initialInstance,
      phase: 'surviving',
      interactive: true,
    })
    expect(revived.destroyedBindingIds).toEqual([])
    expect(revived.diagnostics.supersededBindings).toBe(1)

    const settled = coordinator.sample(480)
    expect(binding(settled, id).instance).toBe(initialInstance)
    expect(settled.destroyedBindingIds).toEqual([])
    expect(settled.diagnostics.destroyedBindingCount).toBe(0)
  })

  it('rejects mutable identity contracts, invalid boundaries, and premature terminal claims', () => {
    const id = graphBindingId('node', 'stable')
    const coordinator = new GraphTransitionCoordinator()
    coordinator.initialize([target('node', 'stable', 20)], 0)

    expect(() => coordinator.retarget([{
      id,
      kind: 'node',
      channels: { radius: 30 },
    }])).toThrow(/cannot change its numeric channel contract/)

    const active = new GraphTransitionCoordinator()
    active.initialize([target('node', 'stable', 20)], 0)
    active.retarget([target('node', 'stable', 40)], { durationMs: 320 })
    active.sample(0)
    expect(() => active.assertTerminalCounts()).toThrow(/not terminal/)
    expect(() => active.sample(-1)).toThrow(/monotonically increasing/)

    const missingBoundary = new GraphTransitionCoordinator()
    missingBoundary.initialize([], 0)
    missingBoundary.retarget([target('node', 'entrant', 30)])
    expect(() => missingBoundary.sample(0)).toThrow(/needs a radialBoundary/)

    expect(() => graphBindingId('node', '   ')).toThrow(/cannot be empty/)
    expect(() => active.assertTerminalCounts({ retainedBindingCount: 99 })).toThrow(/not terminal/)
  })
})
