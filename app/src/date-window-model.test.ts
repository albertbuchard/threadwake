import type { DateWindow, GraphRelation, WorkGroup, WorkNode } from './domain'
import {
  UTC_DAY_MS,
  dateWindowDurationDays,
  dateWindowIsoLabels,
  deriveFullDateWindow,
  expandWindowAfterNodeMutation,
  isFullDateWindow,
  normalizeDateWindow,
  parseDateWindowParams,
  projectDateWindow,
  projectedGroupById,
  revealWindowForNode,
  utcDayEnd,
  utcDayStart,
  writeDateWindowParams,
} from './date-window-model'

function node(
  id: string,
  startedAt: string,
  options: Partial<WorkNode> = {},
): WorkNode {
  return {
    id,
    title: id,
    type: 'experiment',
    status: 'active',
    lifecycle: 'ongoing',
    workstreamId: 'stream',
    sourceThreadIds: ['thread'],
    owner: 'Test',
    startedAt,
    summary: id,
    outcome: '',
    origin: 'Date-window fixture',
    unresolvedQuestions: [],
    nextActions: [],
    artifactIds: [],
    activity: [],
    ...options,
  }
}

const aprilBounds: DateWindow = {
  startMs: Date.parse('2026-04-01T00:00:00.000Z'),
  endMs: Date.parse('2026-04-30T23:59:59.999Z'),
}

describe('inclusive UTC-day date windows', () => {
  it('derives the complete extent from starts and duration ends, rounded outward to UTC days', () => {
    const nodes = [
      node('first', '2026-04-02T12:30:00.000Z'),
      node('duration', '2026-04-05T09:00:00.000Z', { endedAt: '2026-04-11T02:00:00.000Z' }),
    ]
    expect(deriveFullDateWindow(nodes)).toEqual({
      startMs: Date.parse('2026-04-02T00:00:00.000Z'),
      endMs: Date.parse('2026-04-11T23:59:59.999Z'),
    })
    expect(deriveFullDateWindow([], Date.parse('2026-02-03T12:00:00.000Z'))).toEqual({
      startMs: Date.parse('2026-02-03T00:00:00.000Z'),
      endMs: Date.parse('2026-02-03T23:59:59.999Z'),
    })
  })

  it('normalizes equal handles to one inclusive UTC calendar day', () => {
    const timestamp = Date.parse('2026-04-08T13:24:00.000Z')
    const normalized = normalizeDateWindow({ startMs: timestamp, endMs: timestamp }, aprilBounds)
    expect(normalized).toEqual({
      startMs: Date.parse('2026-04-08T00:00:00.000Z'),
      endMs: Date.parse('2026-04-08T23:59:59.999Z'),
    })
    expect(dateWindowDurationDays(normalized)).toBe(1)
    expect(utcDayEnd(timestamp) - utcDayStart(timestamp) + 1).toBe(UTC_DAY_MS)
  })

  it('returns stable ISO labels and detects the canonical full window', () => {
    expect(dateWindowIsoLabels(aprilBounds)).toEqual({
      start: '2026-04-01',
      end: '2026-04-30',
      durationDays: 30,
    })
    expect(isFullDateWindow(aprilBounds, aprilBounds)).toBe(true)
    expect(isFullDateWindow({
      startMs: Date.parse('2026-04-02T00:00:00.000Z'),
      endMs: aprilBounds.endMs,
    }, aprilBounds)).toBe(false)
  })
})

describe('date-window URL state', () => {
  it('restores an exact same-day or multi-day window without mutating unrelated parameters', () => {
    const sameDay = parseDateWindowParams(
      new URLSearchParams('view=graph&windowStart=2026-04-08&windowEnd=2026-04-08'),
      aprilBounds,
    )
    expect(sameDay).toEqual({
      window: {
        startMs: Date.parse('2026-04-08T00:00:00.000Z'),
        endMs: Date.parse('2026-04-08T23:59:59.999Z'),
      },
      canonical: true,
    })

    const original = new URLSearchParams('view=graph')
    const written = writeDateWindowParams(original, {
      startMs: Date.parse('2026-04-08T00:00:00.000Z'),
      endMs: Date.parse('2026-04-12T23:59:59.999Z'),
    }, aprilBounds)
    expect(original.toString()).toBe('view=graph')
    expect(written.get('view')).toBe('graph')
    expect(written.get('windowStart')).toBe('2026-04-08')
    expect(written.get('windowEnd')).toBe('2026-04-12')
  })

  it('omits the full range and identifies every invalid restoration class', () => {
    const explicitFull = parseDateWindowParams(
      new URLSearchParams('windowStart=2026-04-01&windowEnd=2026-04-30'),
      aprilBounds,
    )
    expect(explicitFull.window).toEqual(aprilBounds)
    expect(explicitFull.canonical).toBe(false)

    const fullParams = writeDateWindowParams(
      new URLSearchParams('windowStart=2026-04-02&windowEnd=2026-04-03&view=graph'),
      aprilBounds,
      aprilBounds,
    )
    expect(fullParams.has('windowStart')).toBe(false)
    expect(fullParams.has('windowEnd')).toBe(false)
    expect(fullParams.get('view')).toBe('graph')

    expect(parseDateWindowParams(new URLSearchParams('windowStart=2026-04-02'), aprilBounds).invalidReason)
      .toBe('incomplete')
    expect(parseDateWindowParams(
      new URLSearchParams('windowStart=2026-04-31&windowEnd=2026-04-31'),
      aprilBounds,
    ).invalidReason).toBe('invalid-date')
    expect(parseDateWindowParams(
      new URLSearchParams('windowStart=2026-04-12&windowEnd=2026-04-08'),
      aprilBounds,
    ).invalidReason).toBe('reversed')
    expect(parseDateWindowParams(
      new URLSearchParams('windowStart=2026-03-31&windowEnd=2026-04-08'),
      aprilBounds,
    ).invalidReason).toBe('out-of-bounds')
  })
})

describe('canonical temporal projection', () => {
  const window: DateWindow = {
    startMs: Date.parse('2026-04-03T00:00:00.000Z'),
    endMs: Date.parse('2026-04-03T23:59:59.999Z'),
  }
  const parent = node('parent', '2026-04-02T12:00:00.000Z', {
    endedAt: '2026-04-04T12:00:00.000Z',
  })
  const satellite = node('satellite', '2026-04-03T15:00:00.000Z', {
    satelliteOfNodeId: parent.id,
    parentNodeId: parent.id,
  })
  const exactStart = node('exact-start', '2026-04-03T00:00:00.000Z')
  const exactEnd = node('exact-end', '2026-04-03T23:59:59.999Z')
  const outsideParent = node('outside-parent', '2026-04-09T10:00:00.000Z')
  const hiddenSatellite = node('hidden-satellite', '2026-04-03T12:00:00.000Z', {
    satelliteOfNodeId: outsideParent.id,
    parentNodeId: outsideParent.id,
  })
  const outside = node('outside', '2026-04-10T12:00:00.000Z')
  const nodes = [parent, satellite, exactStart, exactEnd, outsideParent, hiddenSatellite, outside]
  const visibleRelation: GraphRelation = {
    id: 'visible-relation',
    kind: 'related-to',
    sourceNodeId: parent.id,
    targetNodeId: satellite.id,
    visibleByDefault: true,
  }
  const hiddenRelation: GraphRelation = {
    id: 'hidden-relation',
    kind: 'related-to',
    sourceNodeId: parent.id,
    targetNodeId: outside.id,
    visibleByDefault: true,
  }
  const group: WorkGroup = {
    id: 'group',
    name: 'Group',
    note: 'Projection fixture',
    overlayColor: '#336699',
    memberNodeIds: [parent.id, satellite.id, outside.id],
    collapsed: false,
    createdAt: '2026-04-01T00:00:00.000Z',
  }

  it('uses inclusive intersections, clips durations, and requires a visible satellite parent', () => {
    const projection = projectDateWindow(
      nodes,
      [visibleRelation, hiddenRelation],
      [group],
      window,
      aprilBounds,
    )

    expect([...projection.visibleNodeIds]).toEqual([
      parent.id,
      satellite.id,
      exactStart.id,
      exactEnd.id,
    ])
    expect(projection.hiddenNodeIds.has(hiddenSatellite.id)).toBe(true)
    expect(projection.clippedIntervals.get(parent.id)).toEqual({
      nodeId: parent.id,
      startMs: Date.parse('2026-04-02T12:00:00.000Z'),
      endMs: Date.parse('2026-04-04T12:00:00.000Z'),
      clippedStartMs: window.startMs,
      clippedEndMs: window.endMs,
      continuesBefore: true,
      continuesAfter: true,
    })
  })

  it('preserves canonical node, relation, and group identities', () => {
    const projection = projectDateWindow(
      nodes,
      [visibleRelation, hiddenRelation],
      [group],
      window,
      aprilBounds,
    )

    expect(projection.visibleNodes[0]).toBe(parent)
    expect(projection.visibleRelations).toEqual([visibleRelation])
    expect(projection.visibleRelations[0]).toBe(visibleRelation)
    expect(projectedGroupById(projection, group.id)?.group).toBe(group)
    expect(projectedGroupById(projection, group.id)?.visibleMemberNodeIds).toEqual([
      parent.id,
      satellite.id,
    ])
    expect(projectedGroupById(projection, group.id)?.hiddenMemberNodeIds).toEqual([outside.id])
    expect(projectedGroupById(projection, group.id)?.hiddenMemberCount).toBe(1)
  })
})

describe('reveal and changing full bounds', () => {
  it('reveals a satellite together with the complete interval of its required parent', () => {
    const parent = node('parent', '2026-04-05T10:00:00.000Z', {
      endedAt: '2026-04-07T16:00:00.000Z',
    })
    const satellite = node('satellite', '2026-04-08T09:00:00.000Z', {
      satelliteOfNodeId: parent.id,
      parentNodeId: parent.id,
    })
    const revealed = revealWindowForNode({
      startMs: Date.parse('2026-04-03T00:00:00.000Z'),
      endMs: Date.parse('2026-04-03T23:59:59.999Z'),
    }, satellite.id, [parent, satellite], aprilBounds)
    expect(revealed).toEqual({
      startMs: Date.parse('2026-04-03T00:00:00.000Z'),
      endMs: Date.parse('2026-04-08T23:59:59.999Z'),
    })
  })

  it('expands a previous full range but preserves a deliberate subset', () => {
    const previousNodes = [
      node('first', '2026-04-01T12:00:00.000Z'),
      node('last', '2026-04-10T12:00:00.000Z'),
    ]
    const nextNodes = [...previousNodes, node('new', '2026-04-12T12:00:00.000Z')]
    const previousFull = deriveFullDateWindow(previousNodes)
    expect(expandWindowAfterNodeMutation(previousNodes, nextNodes, previousFull)).toEqual(
      deriveFullDateWindow(nextNodes),
    )

    const subset = {
      startMs: Date.parse('2026-04-03T00:00:00.000Z'),
      endMs: Date.parse('2026-04-04T23:59:59.999Z'),
    }
    expect(expandWindowAfterNodeMutation(previousNodes, nextNodes, subset)).toEqual(subset)
  })
})
