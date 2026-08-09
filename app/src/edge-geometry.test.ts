import {
  coalesceVisualEdgeRoutes,
  createEdgeRouteRelaxation,
  minimumRouteNodeClearance,
  minimumRouteSeparation,
  runEdgeRouteRelaxationToStop,
  sampleEdgeRoute,
  stepEdgeRouteRelaxation,
  type EdgePoint,
  type EdgeRouteNodeGeometry,
  type VisualEdgeRouteInput,
} from './edge-geometry'

function pointNode(nodeId: string, x: number, y: number, halfThickness = 7): EdgeRouteNodeGeometry {
  const point = { x, y }
  return { nodeId, point: { ...point }, segmentStart: { ...point }, segmentEnd: { ...point }, halfThickness }
}

function capsuleNode(
  nodeId: string,
  point: EdgePoint,
  segmentStart: EdgePoint,
  segmentEnd: EdgePoint,
  halfThickness = 8,
): EdgeRouteNodeGeometry {
  return {
    nodeId,
    point: { ...point },
    segmentStart: { ...segmentStart },
    segmentEnd: { ...segmentEnd },
    halfThickness,
  }
}

function edge(id: string, sourceNodeId: string, targetNodeId: string): VisualEdgeRouteInput {
  return { id, sourceNodeId, targetNodeId, halfThickness: 1 }
}

describe('bounded edge-route geometry', () => {
  it('is deterministic under reversed node and edge input order', () => {
    const nodes = [
      pointNode('a', -80, -20),
      pointNode('b', 90, 15),
      pointNode('c', 0, 4, 12),
      pointNode('d', -20, 75),
    ]
    const edges = [edge('edge-z', 'a', 'b'), edge('edge-a', 'a', 'b'), edge('edge-c', 'd', 'b')]
    const forward = runEdgeRouteRelaxationToStop(createEdgeRouteRelaxation(nodes, edges))
    const reversed = runEdgeRouteRelaxationToStop(createEdgeRouteRelaxation([...nodes].reverse(), [...edges].reverse()))
    expect(reversed.routeOrder).toEqual(forward.routeOrder)
    expect(reversed.routes).toEqual(forward.routes)
    expect(reversed.diagnostics).toEqual(forward.diagnostics)
  })

  it('coalesces exact duplicate directed routes while retaining stable constituent ids', () => {
    const nodes = [pointNode('a', 0, 0), pointNode('b', 100, 0)]
    const routes = coalesceVisualEdgeRoutes(nodes, [
      edge('relation-3', 'a', 'b'),
      edge('relation-1', 'a', 'b'),
      edge('relation-2', 'b', 'a'),
    ])
    expect(routes).toHaveLength(2)
    const forward = routes.find((route) => route.sourceNodeId === 'a')
    expect(forward?.constituentEdgeIds).toEqual(['relation-1', 'relation-3'])
    expect(routes.find((route) => route.sourceNodeId === 'b')?.constituentEdgeIds).toEqual(['relation-2'])
  })

  it('keeps endpoints exact during sampling and every relaxation step', () => {
    const source = pointNode('source', -60, 10)
    const target = pointNode('target', 75, -8)
    const initial = createEdgeRouteRelaxation([source, target], [edge('edge', 'source', 'target')])
    const routeId = initial.routeOrder[0]
    expect(routeId).toBeDefined()
    const initialRoute = initial.routes[routeId ?? '']
    expect(initialRoute).toBeDefined()
    const stepped = stepEdgeRouteRelaxation(initial, 8)
    const route = stepped.routes[routeId ?? '']
    expect(route?.start).toEqual(source.point)
    expect(route?.end).toEqual(target.point)
    const samples = route ? sampleEdgeRoute(route, 20) : []
    expect(samples[0]).toEqual(source.point)
    expect(samples.at(-1)).toEqual(target.point)
  })

  it('improves clearance around a non-endpoint capsule obstacle', () => {
    const nodes = [
      pointNode('source', -110, 0),
      pointNode('target', 110, 0),
      capsuleNode('obstacle', { x: 0, y: 0 }, { x: -18, y: 0 }, { x: 18, y: 0 }, 20),
    ]
    const initial = createEdgeRouteRelaxation(nodes, [edge('edge', 'source', 'target')], {
      nodePadding: 7,
      nodeRepulsionStrength: 0.9,
      seedStrength: 0.012,
    })
    const routeId = initial.routeOrder[0] ?? ''
    const obstacle = nodes[2]
    const initialRoute = initial.routes[routeId]
    expect(initialRoute).toBeDefined()
    expect(obstacle).toBeDefined()
    const before = initialRoute && obstacle ? minimumRouteNodeClearance(initialRoute, obstacle, 28) : 0
    const final = runEdgeRouteRelaxationToStop(initial)
    const finalRoute = final.routes[routeId]
    const after = finalRoute && obstacle ? minimumRouteNodeClearance(finalRoute, obstacle, 28) : 0
    expect(after).toBeGreaterThan(before + 2)
    expect(final.diagnostics.step).toBeLessThanOrEqual(180)
  })

  it('improves separation between competing nearby routes', () => {
    const nodes = [
      pointNode('left-top', -110, -2),
      pointNode('right-top', 110, -2),
      pointNode('left-bottom', -110, 2),
      pointNode('right-bottom', 110, 2),
    ]
    const initial = createEdgeRouteRelaxation(nodes, [
      edge('upper', 'left-top', 'right-top'),
      edge('lower', 'left-bottom', 'right-bottom'),
    ], {
      edgePadding: 6,
      edgeRepulsionStrength: 0.9,
      seedStrength: 0.01,
    })
    const [firstId, secondId] = initial.routeOrder
    const first = firstId ? initial.routes[firstId] : undefined
    const second = secondId ? initial.routes[secondId] : undefined
    expect(first).toBeDefined()
    expect(second).toBeDefined()
    const before = first && second ? minimumRouteSeparation(first, second, 30) : 0
    const final = runEdgeRouteRelaxationToStop(initial)
    const finalFirst = firstId ? final.routes[firstId] : undefined
    const finalSecond = secondId ? final.routes[secondId] : undefined
    const after = finalFirst && finalSecond ? minimumRouteSeparation(finalFirst, finalSecond, 30) : 0
    expect(after).toBeGreaterThan(before + 1)
    expect(final.diagnostics.step).toBeLessThanOrEqual(180)
  })

  it('sleeps after bounded convergence and never advances a stopped state', () => {
    const initial = createEdgeRouteRelaxation(
      [pointNode('a', 0, 0), pointNode('b', 120, 40)],
      [edge('edge', 'a', 'b')],
    )
    const final = runEdgeRouteRelaxationToStop(initial)
    expect(final.diagnostics.stopped).toBe(true)
    expect(final.diagnostics.converged).toBe(true)
    expect(final.diagnostics.stopReason).toBe('converged')
    expect(final.diagnostics.step).toBeLessThanOrEqual(180)
    expect(final.diagnostics.maxMotion).toBeLessThan(0.05)
    expect(final.diagnostics.maxSpeed).toBeLessThan(0.02)
    expect(stepEdgeRouteRelaxation(final, 50)).toBe(final)
  })

  it('does not mutate node, edge, or prior state inputs', () => {
    const nodes = [pointNode('a', -40, 0), pointNode('b', 40, 0), pointNode('c', 0, 0, 12)]
    const edges = [edge('edge', 'a', 'b')]
    const nodesSnapshot = structuredClone(nodes)
    const edgesSnapshot = structuredClone(edges)
    const initial = createEdgeRouteRelaxation(nodes, edges)
    const initialSnapshot = structuredClone(initial)
    stepEdgeRouteRelaxation(initial, 4)
    expect(nodes).toEqual(nodesSnapshot)
    expect(edges).toEqual(edgesSnapshot)
    expect(initial).toEqual(initialSnapshot)
  })
})
