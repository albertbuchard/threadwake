# Threadwake product vision

## Product promise

Threadwake turns long-running agent work into one navigable workgraph. It preserves the relationships, evidence, provenance, rejected paths, lifecycle state, outcome, and next-action context that are lost when work is represented only as a chronological list of conversations.

The product is designed around one rule: every view is a projection of the same canonical work state. Moving a work unit in Kanban, selecting it in Graph, filtering it in List, or inspecting its evidence must never create a second identity or a competing source of truth.

## Intended audience

The primary audience is a person coordinating complex work across agent sessions. That person needs to recover intent quickly, understand dependencies, distinguish active and rejected paths, inspect the basis for decisions, and start the next action with the right bounded context.

The public package also serves OpenAI reviewers and open-source contributors. A reviewer should be able to evaluate the proposed Codex interaction, trust boundary, and evidence from the repository alone. A contributor should be able to run the deterministic fixture, understand the architecture, and change one layer without reverse-engineering unrelated layers.

## Product surfaces

### Graph

Graph shows work units and their supported relationships in a spatial view. It helps a user understand hierarchy, dependencies, branching, convergence, and rejected paths. Spatial position supports comprehension but does not define canonical identity or hierarchy. Selection in Graph opens the same work unit that appears in every other view.

### Kanban

Kanban organizes the canonical work units by lifecycle. It supports scanning and, when the active store permits writes, moving a unit through a validated lifecycle transition. A column position is a view of lifecycle, not a second record. Outcome remains explicit and is not derived from column color.

### List

List provides a dense, keyboard-friendly way to search, sort, filter, compare, and select work. It is the fallback surface when a graph or board is too visually dense. Filters and selection are shared across views where that helps orientation, but view-specific layout preferences do not change work data.

### Inspector, history, and evidence

The inspector explains the selected unit in full. It shows identity, project or group, hierarchy, lifecycle, outcome, provenance, evidence, rejected-path context, and the exact context intended for the next action. History shows meaningful state changes and conflict or rollback receipts. Evidence remains inspectable and attributable; the interface does not reduce it to a decorative badge.

### Creation and change preview

Creation and material edits use an explicit form or preview surface. Required actions, including the node-creation confirmation button, remain visible within the viewport and cannot be hidden below a modal or page boundary. A write is validated against the active store and does not become canonical merely because the interface optimistically rendered it.

### Theme selection

Theme selection is keyboard accessible and stored predictably. The registry includes a theme named exactly `Codex`. It uses semantic tokens for white and neutral gray surfaces, gray text and borders, and restrained blue accents. Lifecycle, outcome, focus, and validation state remain understandable without relying on color alone. The theme is described as a Threadwake design choice, not as an official OpenAI theme.

## Product behavior across operating modes

Standalone visual mode is the implemented local visual evaluation experience. It uses deterministic synthetic work and requires no account, credential, hosted service, or Forge installation. Graph, Kanban, List, and Inspector run from the application's own imported fixture and state layer.

Fixture MCP mode is a separate implemented evaluation experience. Its deterministic synthetic state is in memory and resets when the server process exits. The application and MCP fixture are not yet connected by an application adapter.

Local plugin mode provides a repository-scoped Codex plugin. Its skill explains when and how to use the workgraph, how to inspect evidence and rejected paths, and how to separate reads from material writes. The plugin contains a dependency-bundled server that executes from the installed cache while source-repository reads are denied. It exposes exactly 8 fixture tools: capabilities, list, get, search, evidence, preview, confirm, and undo.

The plugin has no MCP Apps widget. The repository contains the released pure task-link contract and synthetic tests, but no adapter, private snapshot, real host identity, conversation excerpt, desktop mockup, host switch, or link user interface. A future visual integration is limited to a thin, read-only wrapper after a separately reviewed public-safe shell is released.

Forge-backed mode is currently a disabled boundary. Mapping helpers accept deterministic Forge-shaped fixtures, and every store operation returns unsupported. The browser never contains Forge credentials or calls a Forge service. Live Forge operation requires separate implementation, configuration, authority, and validation.

A future hosted mode could expose the same contract through one stable public HTTPS Model Context Protocol endpoint with production authentication, authorization, privacy controls, observability, and support. That hosted mode and any public plugin-directory submission are outside the current verified product state.

## Canonical domain model

The imported application's synthetic domain and state are separate from the MCP contract. A public adapter between them is not implemented. The current MCP server depends on `WorkGraphRepository`, implemented by `FixtureWorkGraphStore` for deterministic state and `DisabledForgeWorkGraphStore` for the always-unsupported Forge boundary. The implemented MCP contract exposes capabilities, listing, search, pagination, work-unit inspection, evidence retrieval, fixture lifecycle preview, fixture confirmation, fixture undo, conflicts, and health. It does not expose hierarchy attachment, context updates, or history mutation.

Shared schemas define work units, project or grouping metadata, supported hierarchy, lifecycle, outcome, evidence, provenance, context transfer, pagination, fixture lifecycle changes, conflicts, and capability discovery. Stable identifiers survive every view and adapter. The generic document schema permits `synthetic: false`, while the fixture schema requires `synthetic: true`. Hierarchy validation rejects cycles and orphans in linear `O(V + E)` time. Unsupported concepts are reported as unsupported instead of being approximated silently.

The local fixture server owns schema checks, origin and host checks for loopback HTTP, server-issued previews, version checks, confirmation, idempotency, conflicts, and receipts. Confirm and undo are marked destructive and idempotent because they change in-memory state and make identical retries safe. Only the most recently confirmed change can be undone, and only when no later confirmed change has ever existed on that work unit. Undoing it does not reopen an older receipt. All fixture tools are closed-world. A future connected gateway must add credentials, authentication, authorization, tenant isolation, and production failure handling.

## Architecture

The repository is an npm workspace with 4 explicit layers:

- `app/` contains the implemented responsive React application and its isolated synthetic state. It is not yet adapter-integrated with the contracts or MCP server.
- `packages/contracts/` contains the implemented framework-independent TypeScript types and Zod schemas.
- `packages/mcp-server/` contains the implemented fixture server and disabled Forge boundary.
- `plugins/threadwake/` contains the validated Codex manifest, Threadwake skill, public assets, `.mcp.json`, generated notices, and dependency-bundled server.

A future application adapter must route all views and supported mutations through the same versioned workgraph contract. The installed plugin executable already passes the isolation requirement: source and cache bytes match, and sandboxed cache execution succeeds while source-repository reads are denied.

## Technology stack

The implemented application uses React 19.2.8 and React DOM 19.2.8 for the interface, TypeScript 7.0.2 for strict static typing, Vite 7.3.6 for development and production builds, PixiJS 8.19.0 for the graph canvas, Motion 12.43.0 for bounded interface motion, Phosphor Icons React 2.1.10 for icons, Manrope and IBM Plex Mono through Fontsource 5.3.0, and CSS custom properties for semantic theme tokens.

The current package uses Node.js 22.22.0 or later, npm 11.12.1, TypeScript 7.0.2, MCP SDK 1.30.0, Zod 4.4.3, esbuild 0.28.2, Vitest 4.1.10, Testing Library 16.3.2, User Event 14.6.3, and jsdom 29.0.1. The workspace uses npm workspaces and one committed lockfile. The current implementation test run passes 15 application files with 167 tests and 6 contracts and MCP files with 31 tests: 21 files and 198 implementation tests in one receipt.

The production entry is 290,384 bytes against a 444,077-byte ceiling and contains no QA instrumentation markers. The QA build loads a 5.56 kB performance chunk lazily and tests cleanup. The current server build produces a deterministic dependency-bundled executable for both the plugin and standalone local use.

## Security and privacy model

Synthetic fixture mode collects and transmits no user work. In connected modes, the gateway is the trust boundary. It accepts only validated versioned input, keeps credentials server-side, limits origins and sessions, separates reads from writes, applies least privilege, and returns structured errors without leaking secrets. Logs and evidence must be designed for redaction, retention, deletion, and incident handling before a hosted service is claimed.

Prompt text, work-unit content, and imported evidence are untrusted input. They cannot change tool policy, bypass confirmation, select a different tenant, or authorize a write. A visual drag, generated instruction, or plugin skill is a request; the server makes the authorization decision.

The public repository contains only allowlisted material. Fixtures are synthetic. Files with personal context, internal coordination, local paths, credentials, provider receipts, uncertain provenance, or uncertain redistribution rights do not enter public history. First-party code and documentation use Apache License 2.0, and the public privacy, terms, support, and security routes identify Albert Buchard as publisher.

## Experience and quality bar

Desktop and mobile behavior are designed and verified together. Live checks have covered 390 by 844, 390 by 600, and 320 by 568 viewports, a deterministic 2-times text-scale fixture, and a keyboard-safe-area fixture. Required controls must remain usable on desktop, phone, short-height viewports, and at true 200% browser zoom. Every required control's complete border box must remain inside the viewport. Nine deterministic hit-test samples—the center, four inset corners, and four inset edge midpoints—must resolve to the control or an owned descendant; any unexpected occluder fails the check.

True browser 200% zoom remains unproved. The current tooling cannot perform a formal Chrome DevTools or Core Web Vitals audit. Synthetic desktop and mobile screenshots are persisted, but those images are supporting evidence rather than substitutes for the missing checks. The remaining gaps stay explicit release work.

Ordinary text must meet at least 4.5:1 contrast, large text at least 3:1, and meaningful non-text marks and focus indicators at least 3:1 where applicable. Keyboard operation, visible focus, reduced motion, touch targets, and non-color status cues are release requirements. The application must not trade correctness or accessibility for canvas density or animation.

The ordinary production build excludes diagnostic instrumentation, permanent animation loops, and unbounded timers. One authoritative Vite configuration owns the real TypeScript entry point. Clean installation, strict type checking, tests, production build, plugin validation, Model Context Protocol smoke tests, public privacy checks, and zero unresolved Critical or High advisories are required before release.

## Product boundaries

Threadwake is not a second canonical task database, a general chat archive, or a complete enterprise project-management platform. It does not infer truth from layout. It does not provide live Forge access by default, expose credentials in the browser, claim production multi-tenant security before implementation, or represent a local demonstration as a hosted service. It does not claim OpenAI endorsement, official theme status, or public plugin availability.
