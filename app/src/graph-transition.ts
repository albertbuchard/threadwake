export const MAX_GRAPH_TRANSITION_DURATION_MS = 320
export const DEFAULT_GRAPH_TRANSITION_DURATION_MS = 320
export const ENTER_SCALE = 0.94
export const EXIT_SCALE = 0.96

export const GRAPH_BINDING_KINDS = [
  'node',
  'relation',
  'group',
  'ring',
  'label',
  'hit-target',
] as const

export type GraphBindingKind = (typeof GRAPH_BINDING_KINDS)[number]
export type GraphBindingId = `${GraphBindingKind}:${string}`
export type GraphBindingPhase = 'entering' | 'surviving' | 'exiting' | 'settled'
export type RadialBoundarySide = 'inner' | 'outer' | 'nearest'
export type NumericChannels = Readonly<Record<string, number>>
export type RadialPointChannels = readonly (readonly [xChannel: string, yChannel: string])[]

export interface RadialBoundary {
  readonly centerX: number
  readonly centerY: number
  readonly innerRadius: number
  readonly outerRadius: number
}

export interface GraphBindingTarget {
  /** A stable, namespaced identity. It is never replaced while a retained object lives. */
  readonly id: GraphBindingId
  readonly kind: GraphBindingKind
  /**
   * All render geometry is expressed as finite numeric channels. A node may use x/y,
   * while a route can expose sourceX/sourceY/controlX/controlY/targetX/targetY.
   */
  readonly channels: NumericChannels
  readonly opacity?: number
  readonly scale?: number
  readonly interactive?: boolean
  /** Required only when the semantic side is known; otherwise the nearer boundary wins. */
  readonly entryBoundary?: RadialBoundarySide
  /** Coordinate pairs projected together when a binding enters or exits the time window. */
  readonly radialPoints?: RadialPointChannels
}

export interface GraphRetargetOptions {
  readonly durationMs?: number
  readonly reducedMotion?: boolean
  readonly radialBoundary?: RadialBoundary
  /** The date-window projection should supply inner/outer when it knows which edge hid an item. */
  readonly exitBoundaryById?: Readonly<Partial<Record<GraphBindingId, RadialBoundarySide>>>
}

export interface GraphTransitionBinding {
  readonly id: GraphBindingId
  readonly kind: GraphBindingKind
  readonly instance: number
  readonly channels: NumericChannels
  readonly opacity: number
  readonly scale: number
  readonly interactive: boolean
  readonly phase: GraphBindingPhase
}

export interface GraphTransitionDiagnostics {
  readonly queuedPreviewFrames: 0 | 1
  readonly activeTransitions: 0 | 1
  /** Still-moving retained binding instances inherited from an interrupted transition. */
  readonly supersededBindings: number
  /** Lifetime count retained separately so interruption evidence is not lost at settlement. */
  readonly cumulativeSupersededBindings: number
  /** Cumulative number of exited retained binding instances destroyed exactly once. */
  readonly destroyedBindingCount: number
  /** The coordinator is sampled by its owner and allocates no listeners, tickers, or timers. */
  readonly listenerCount: 0
  readonly tickerCount: 0
  readonly timerCount: 0
  readonly generation: number
}

export interface GraphTransitionFrame {
  readonly nowMs: number
  readonly generation: number
  readonly settled: boolean
  readonly bindings: readonly GraphTransitionBinding[]
  /** Destruction events emitted by this sample only. */
  readonly destroyedBindingIds: readonly GraphBindingId[]
  readonly diagnostics: GraphTransitionDiagnostics
}

export interface GraphTransitionTerminalCounts {
  readonly generation: number
  readonly retainedBindingCount: number
  readonly expectedRetainedBindingCount: number
  readonly destroyedExitBindingCount: number
  readonly expectedDestroyedExitBindingCount: number
  readonly activeTransitions: 0
  readonly queuedPreviewFrames: 0
  readonly supersededBindings: 0
  readonly listenerCount: 0
  readonly tickerCount: 0
  readonly timerCount: 0
}

type TerminalCountExpectation = Partial<Pick<
  GraphTransitionTerminalCounts,
  | 'generation'
  | 'retainedBindingCount'
  | 'expectedRetainedBindingCount'
  | 'destroyedExitBindingCount'
  | 'expectedDestroyedExitBindingCount'
  | 'supersededBindings'
  | 'listenerCount'
  | 'tickerCount'
  | 'timerCount'
>>

interface NormalizedTarget {
  readonly id: GraphBindingId
  readonly kind: GraphBindingKind
  readonly channels: Readonly<Record<string, number>>
  readonly opacity: number
  readonly scale: number
  readonly interactive: boolean
  readonly entryBoundary: RadialBoundarySide
  readonly radialPoints: RadialPointChannels
}

interface RetainedBinding extends NormalizedTarget {
  readonly instance: number
}

interface MotionBinding {
  readonly from: RetainedBinding
  readonly to: RetainedBinding
  readonly phase: Exclude<GraphBindingPhase, 'settled'>
  readonly destroyOnComplete: boolean
  readonly hasMotion: boolean
}

interface ActiveTransition {
  readonly generation: number
  readonly startedAtMs: number
  readonly durationMs: number
  readonly motions: ReadonlyMap<GraphBindingId, MotionBinding>
  readonly targets: ReadonlyMap<GraphBindingId, RetainedBinding>
  readonly destroyedAtStart: number
  readonly expectedExitBindingCount: number
}

interface QueuedRetarget {
  readonly targets: ReadonlyMap<GraphBindingId, NormalizedTarget>
  readonly options: GraphRetargetOptions
}

const KIND_SET = new Set<string>(GRAPH_BINDING_KINDS)
const BOUNDARY_SIDE_SET = new Set<string>(['inner', 'outer', 'nearest'])
const DEFAULT_POINT_CHANNELS = [['x', 'y']] as const

function finite(value: number, name: string): number {
  if (!Number.isFinite(value)) {
    throw new Error(`${name} must be finite`)
  }
  return value
}

function unitInterval(value: number, name: string): number {
  finite(value, name)
  if (value < 0 || value > 1) {
    throw new Error(`${name} must be between 0 and 1`)
  }
  return value
}

function positive(value: number, name: string): number {
  finite(value, name)
  if (value <= 0) {
    throw new Error(`${name} must be greater than zero`)
  }
  return value
}

function bindingKindFromId(id: string): GraphBindingKind | null {
  const separator = id.indexOf(':')
  const kind = separator > 0 ? id.slice(0, separator) : ''
  return KIND_SET.has(kind) ? kind as GraphBindingKind : null
}

export function graphBindingId(kind: GraphBindingKind, stableId: string): GraphBindingId {
  if (stableId.trim().length === 0) {
    throw new Error('A graph binding stable ID cannot be empty')
  }
  return `${kind}:${stableId}`
}

function normalizedPoints(
  channels: Readonly<Record<string, number>>,
  radialPoints: RadialPointChannels | undefined,
  id: GraphBindingId,
): RadialPointChannels {
  const points = radialPoints ?? (
    Object.hasOwn(channels, 'x') && Object.hasOwn(channels, 'y')
      ? DEFAULT_POINT_CHANNELS
      : []
  )
  const seen = new Set<string>()
  return points.map(([xChannel, yChannel]) => {
    if (!Object.hasOwn(channels, xChannel) || !Object.hasOwn(channels, yChannel)) {
      throw new Error(`${id} radial point ${xChannel}/${yChannel} is missing from its channels`)
    }
    const key = `${xChannel}\0${yChannel}`
    if (seen.has(key)) {
      throw new Error(`${id} repeats radial point ${xChannel}/${yChannel}`)
    }
    seen.add(key)
    return [xChannel, yChannel] as const
  })
}

function normalizeTarget(target: GraphBindingTarget): NormalizedTarget {
  const idKind = bindingKindFromId(target.id)
  if (idKind !== target.kind) {
    throw new Error(`${target.id} must use the ${target.kind}: namespace`)
  }
  const channelEntries = Object.entries(target.channels).sort(([left], [right]) => left.localeCompare(right))
  if (channelEntries.length === 0) {
    throw new Error(`${target.id} must expose at least one numeric channel`)
  }
  const channels = Object.fromEntries(channelEntries.map(([name, value]) => [
    name,
    finite(value, `${target.id}.${name}`),
  ]))
  const entryBoundary = target.entryBoundary ?? 'nearest'
  if (!BOUNDARY_SIDE_SET.has(entryBoundary)) {
    throw new Error(`${target.id}.entryBoundary must be inner, outer, or nearest`)
  }
  return {
    id: target.id,
    kind: target.kind,
    channels: Object.freeze(channels),
    opacity: unitInterval(target.opacity ?? 1, `${target.id}.opacity`),
    scale: positive(target.scale ?? 1, `${target.id}.scale`),
    interactive: target.interactive ?? true,
    entryBoundary,
    radialPoints: normalizedPoints(channels, target.radialPoints, target.id),
  }
}

function normalizeTargets(targets: readonly GraphBindingTarget[]): ReadonlyMap<GraphBindingId, NormalizedTarget> {
  const normalized = new Map<GraphBindingId, NormalizedTarget>()
  for (const target of targets) {
    const next = normalizeTarget(target)
    if (normalized.has(next.id)) {
      throw new Error(`Duplicate graph binding ID: ${next.id}`)
    }
    normalized.set(next.id, next)
  }
  return normalized
}

function normalizeBoundary(boundary: RadialBoundary | undefined): RadialBoundary | undefined {
  if (!boundary) return undefined
  const normalized = {
    centerX: finite(boundary.centerX, 'radialBoundary.centerX'),
    centerY: finite(boundary.centerY, 'radialBoundary.centerY'),
    innerRadius: finite(boundary.innerRadius, 'radialBoundary.innerRadius'),
    outerRadius: finite(boundary.outerRadius, 'radialBoundary.outerRadius'),
  }
  if (normalized.innerRadius < 0 || normalized.outerRadius <= normalized.innerRadius) {
    throw new Error('radialBoundary must have 0 <= innerRadius < outerRadius')
  }
  return normalized
}

function sameChannelContract(left: RetainedBinding, right: NormalizedTarget): void {
  const leftKeys = Object.keys(left.channels).sort()
  const rightKeys = Object.keys(right.channels).sort()
  if (left.kind !== right.kind) {
    throw new Error(`${right.id} cannot change kind while its retained identity is alive`)
  }
  if (leftKeys.length !== rightKeys.length || leftKeys.some((key, index) => key !== rightKeys[index])) {
    throw new Error(`${right.id} cannot change its numeric channel contract while retained`)
  }
}

function withInstance(target: NormalizedTarget, instance: number): RetainedBinding {
  return { ...target, instance }
}

function projectToBoundary(
  binding: RetainedBinding,
  boundary: RadialBoundary | undefined,
  requestedSide: RadialBoundarySide,
): Readonly<Record<string, number>> {
  if (!boundary) {
    throw new Error(`${binding.id} needs a radialBoundary to enter or exit`)
  }
  if (binding.radialPoints.length === 0) {
    throw new Error(`${binding.id} needs radialPoints to enter or exit at a radial boundary`)
  }
  const projected = { ...binding.channels }
  for (const [xChannel, yChannel] of binding.radialPoints) {
    const x = binding.channels[xChannel] as number
    const y = binding.channels[yChannel] as number
    const deltaX = x - boundary.centerX
    const deltaY = y - boundary.centerY
    const radius = Math.hypot(deltaX, deltaY)
    const side = requestedSide === 'nearest'
      ? radius - boundary.innerRadius <= boundary.outerRadius - radius ? 'inner' : 'outer'
      : requestedSide
    const targetRadius = side === 'inner' ? boundary.innerRadius : boundary.outerRadius
    const directionX = radius > Number.EPSILON ? deltaX / radius : 1
    const directionY = radius > Number.EPSILON ? deltaY / radius : 0
    projected[xChannel] = boundary.centerX + directionX * targetRadius
    projected[yChannel] = boundary.centerY + directionY * targetRadius
  }
  return Object.freeze(projected)
}

function channelsEqual(left: NumericChannels, right: NumericChannels): boolean {
  return Object.keys(left).every((key) => left[key] === right[key])
}

function bindingMotionChanged(from: RetainedBinding, to: RetainedBinding): boolean {
  return !channelsEqual(from.channels, to.channels)
    || from.opacity !== to.opacity
    || from.scale !== to.scale
    || from.interactive !== to.interactive
}

function interpolate(from: number, to: number, progress: number): number {
  return from + (to - from) * progress
}

function smoothStep(progress: number): number {
  return progress * progress * (3 - 2 * progress)
}

function interpolateBinding(motion: MotionBinding, progress: number): RetainedBinding {
  const eased = smoothStep(progress)
  const channels = Object.fromEntries(Object.keys(motion.from.channels).map((name) => [
    name,
    interpolate(motion.from.channels[name] as number, motion.to.channels[name] as number, eased),
  ]))
  return {
    ...motion.to,
    channels: Object.freeze(channels),
    opacity: interpolate(motion.from.opacity, motion.to.opacity, eased),
    scale: interpolate(motion.from.scale, motion.to.scale, eased),
    interactive: motion.phase === 'exiting' ? false : motion.to.interactive,
  }
}

function durationMs(options: GraphRetargetOptions): number {
  const requested = finite(options.durationMs ?? DEFAULT_GRAPH_TRANSITION_DURATION_MS, 'durationMs')
  return Math.max(0, Math.min(MAX_GRAPH_TRANSITION_DURATION_MS, requested))
}

function sortedBindings(bindings: ReadonlyMap<GraphBindingId, RetainedBinding>): readonly RetainedBinding[] {
  return [...bindings.values()].sort((left, right) => left.id.localeCompare(right.id))
}

/**
 * A timer-free retained-scene coordinator. Call `retarget` as often as input changes;
 * only the latest pending preview survives. Call `sample` once from the renderer's
 * animation frame or Pixi ticker to flush that preview and obtain one coherent frame.
 */
export class GraphTransitionCoordinator {
  private bindings = new Map<GraphBindingId, RetainedBinding>()
  private phases = new Map<GraphBindingId, GraphBindingPhase>()
  private active: ActiveTransition | null = null
  private queued: QueuedRetarget | null = null
  private initialized = false
  private generation = 0
  private nextInstance = 1
  private lastSampleMs = Number.NEGATIVE_INFINITY
  private supersededBindings = 0
  private cumulativeSupersededBindings = 0
  private destroyedBindingCount = 0
  private terminalCounts: GraphTransitionTerminalCounts | null = null

  initialize(targets: readonly GraphBindingTarget[], nowMs = 0): GraphTransitionFrame {
    if (this.initialized) {
      throw new Error('GraphTransitionCoordinator can only be initialized once')
    }
    finite(nowMs, 'nowMs')
    const normalized = normalizeTargets(targets)
    for (const target of normalized.values()) {
      const retained = withInstance(target, this.nextInstance++)
      this.bindings.set(retained.id, retained)
      this.phases.set(retained.id, 'settled')
    }
    this.initialized = true
    this.lastSampleMs = nowMs
    this.terminalCounts = {
      generation: 0,
      retainedBindingCount: this.bindings.size,
      expectedRetainedBindingCount: normalized.size,
      destroyedExitBindingCount: 0,
      expectedDestroyedExitBindingCount: 0,
      activeTransitions: 0,
      queuedPreviewFrames: 0,
      supersededBindings: 0,
      listenerCount: 0,
      tickerCount: 0,
      timerCount: 0,
    }
    return this.frame(nowMs, [])
  }

  /** Coalesces any number of preview updates into the next rendered frame. */
  retarget(targets: readonly GraphBindingTarget[], options: GraphRetargetOptions = {}): void {
    this.assertInitialized()
    const normalizedTargets = normalizeTargets(targets)
    for (const target of normalizedTargets.values()) {
      const current = this.bindings.get(target.id)
      if (current) sameChannelContract(current, target)
    }
    const exitBoundaryById = options.exitBoundaryById
    if (exitBoundaryById) {
      for (const [id, side] of Object.entries(exitBoundaryById)) {
        if (side !== undefined && !BOUNDARY_SIDE_SET.has(side)) {
          throw new Error(`${id} exit boundary must be inner, outer, or nearest`)
        }
      }
    }
    this.queued = {
      targets: normalizedTargets,
      options: {
        ...options,
        durationMs: durationMs(options),
        radialBoundary: normalizeBoundary(options.radialBoundary),
      },
    }
    this.terminalCounts = null
  }

  sample(nowMs: number): GraphTransitionFrame {
    this.assertInitialized()
    finite(nowMs, 'nowMs')
    if (nowMs < this.lastSampleMs) {
      throw new Error('Graph transition samples must use monotonically increasing time')
    }
    this.lastSampleMs = nowMs
    const destroyedThisFrame: GraphBindingId[] = []

    if (this.active) {
      destroyedThisFrame.push(...this.sampleActive(nowMs))
    }

    if (this.queued) {
      const queued = this.queued
      this.queued = null
      if (this.active) {
        this.supersededBindings = [...this.active.motions.values()]
          .filter((motion) => motion.hasMotion).length
        this.cumulativeSupersededBindings += this.supersededBindings
        this.active = null
      }
      destroyedThisFrame.push(...this.startTransition(queued, nowMs))
    }

    return this.frame(nowMs, destroyedThisFrame)
  }

  diagnostics(): GraphTransitionDiagnostics {
    return {
      queuedPreviewFrames: this.queued ? 1 : 0,
      activeTransitions: this.active ? 1 : 0,
      supersededBindings: this.supersededBindings,
      cumulativeSupersededBindings: this.cumulativeSupersededBindings,
      destroyedBindingCount: this.destroyedBindingCount,
      listenerCount: 0,
      tickerCount: 0,
      timerCount: 0,
      generation: this.generation,
    }
  }

  assertTerminalCounts(expected: TerminalCountExpectation = {}): GraphTransitionTerminalCounts {
    if (this.active || this.queued || !this.terminalCounts) {
      throw new Error('Graph transition is not terminal')
    }
    const receipt = this.terminalCounts
    if (receipt.retainedBindingCount !== receipt.expectedRetainedBindingCount) {
      throw new Error(
        `Terminal retained binding count ${receipt.retainedBindingCount} did not match ${receipt.expectedRetainedBindingCount}`,
      )
    }
    if (receipt.destroyedExitBindingCount !== receipt.expectedDestroyedExitBindingCount) {
      throw new Error(
        `Terminal destroyed exit count ${receipt.destroyedExitBindingCount} did not match ${receipt.expectedDestroyedExitBindingCount}`,
      )
    }
    for (const [name, value] of Object.entries(expected)) {
      const actual = receipt[name as keyof TerminalCountExpectation]
      if (actual !== value) {
        throw new Error(`Terminal ${name} was ${String(actual)}; expected ${String(value)}`)
      }
    }
    return { ...receipt }
  }

  private assertInitialized(): void {
    if (!this.initialized) {
      throw new Error('GraphTransitionCoordinator must be initialized before use')
    }
  }

  private startTransition(queued: QueuedRetarget, nowMs: number): GraphBindingId[] {
    this.generation += 1
    const targets = new Map<GraphBindingId, RetainedBinding>()
    const motions = new Map<GraphBindingId, MotionBinding>()
    const boundary = queued.options.radialBoundary

    for (const target of queued.targets.values()) {
      const current = this.bindings.get(target.id)
      if (current) {
        sameChannelContract(current, target)
        const retainedTarget = withInstance(target, current.instance)
        targets.set(target.id, retainedTarget)
        motions.set(target.id, {
          from: current,
          to: retainedTarget,
          phase: 'surviving',
          destroyOnComplete: false,
          hasMotion: bindingMotionChanged(current, retainedTarget),
        })
        continue
      }

      const retainedTarget = withInstance(target, this.nextInstance++)
      const enteredFrom: RetainedBinding = {
        ...retainedTarget,
        channels: projectToBoundary(retainedTarget, boundary, retainedTarget.entryBoundary),
        opacity: 0,
        scale: retainedTarget.scale * ENTER_SCALE,
      }
      targets.set(target.id, retainedTarget)
      motions.set(target.id, {
        from: enteredFrom,
        to: retainedTarget,
        phase: 'entering',
        destroyOnComplete: false,
        hasMotion: true,
      })
    }

    let exitCount = 0
    for (const current of this.bindings.values()) {
      if (targets.has(current.id)) continue
      const requestedSide = queued.options.exitBoundaryById?.[current.id] ?? 'nearest'
      const exitTarget: RetainedBinding = {
        ...current,
        channels: projectToBoundary(current, boundary, requestedSide),
        opacity: 0,
        scale: current.scale * EXIT_SCALE,
        interactive: false,
      }
      motions.set(current.id, {
        from: { ...current, interactive: false },
        to: exitTarget,
        phase: 'exiting',
        destroyOnComplete: true,
        hasMotion: true,
      })
      exitCount += 1
    }

    const active: ActiveTransition = {
      generation: this.generation,
      startedAtMs: nowMs,
      durationMs: durationMs(queued.options),
      motions,
      targets,
      destroyedAtStart: this.destroyedBindingCount,
      expectedExitBindingCount: exitCount,
    }
    this.active = active
    this.phases = new Map([...motions].map(([id, motion]) => [id, motion.phase]))

    const hasMotion = [...motions.values()].some((motion) => motion.hasMotion)
    if (queued.options.reducedMotion || active.durationMs === 0 || !hasMotion) {
      return this.completeActive()
    }

    this.bindings = new Map([...motions].map(([id, motion]) => [
      id,
      interpolateBinding(motion, 0),
    ]))
    return []
  }

  private sampleActive(nowMs: number): GraphBindingId[] {
    const active = this.active
    if (!active) return []
    const elapsed = Math.max(0, nowMs - active.startedAtMs)
    const progress = active.durationMs === 0 ? 1 : Math.min(1, elapsed / active.durationMs)
    if (progress >= 1) {
      return this.completeActive()
    }
    this.bindings = new Map([...active.motions].map(([id, motion]) => [
      id,
      interpolateBinding(motion, progress),
    ]))
    this.phases = new Map([...active.motions].map(([id, motion]) => [id, motion.phase]))
    return []
  }

  private completeActive(): GraphBindingId[] {
    const active = this.active
    if (!active) return []
    const destroyedBindingIds: GraphBindingId[] = []
    for (const motion of active.motions.values()) {
      if (motion.destroyOnComplete) {
        destroyedBindingIds.push(motion.from.id)
        this.destroyedBindingCount += 1
      }
    }
    this.bindings = new Map(active.targets)
    this.phases = new Map([...active.targets.keys()].map((id) => [id, 'settled' as const]))
    this.active = null
    this.supersededBindings = 0
    this.terminalCounts = {
      generation: active.generation,
      retainedBindingCount: this.bindings.size,
      expectedRetainedBindingCount: active.targets.size,
      destroyedExitBindingCount: this.destroyedBindingCount - active.destroyedAtStart,
      expectedDestroyedExitBindingCount: active.expectedExitBindingCount,
      activeTransitions: 0,
      queuedPreviewFrames: 0,
      supersededBindings: 0,
      listenerCount: 0,
      tickerCount: 0,
      timerCount: 0,
    }
    return destroyedBindingIds.sort()
  }

  private frame(nowMs: number, destroyedBindingIds: readonly GraphBindingId[]): GraphTransitionFrame {
    const bindings = sortedBindings(this.bindings).map((binding): GraphTransitionBinding => ({
      id: binding.id,
      kind: binding.kind,
      instance: binding.instance,
      channels: binding.channels,
      opacity: binding.opacity,
      scale: binding.scale,
      interactive: binding.interactive,
      phase: this.phases.get(binding.id) ?? 'settled',
    }))
    return {
      nowMs,
      generation: this.generation,
      settled: !this.active && !this.queued,
      bindings,
      destroyedBindingIds: [...destroyedBindingIds],
      diagnostics: this.diagnostics(),
    }
  }
}
