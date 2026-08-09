# Threadwake product requirements

## Purpose and release posture

Threadwake must provide a truthful, reproducible public evaluation of a workgraph for long-running agent work. The release is intended to help an OpenAI reviewer, an open-source contributor, or a technically capable user understand and run the product without access to any non-public context.

This document defines the target requirements. The repository now contains the allowlisted standalone synthetic application, implemented shared contracts, a separate deterministic fixture MCP server, a repository marketplace, public documentation, and a supported-validator-clean MCP-backed Codex plugin. The exact current manifest contains 132 files, and 76 repository-validator tests pass. The current implementation test run passes 15 application test files with 167 tests and 6 contracts and MCP test files with 31 tests: 21 files and 198 implementation tests in one receipt. Production and full dependency audits each report 0 vulnerabilities, and a checksum-verified Darwin Gitleaks `8.30.1` scan found no leaks.

The installed plugin exposes exactly 8 fixture tools from a plugin-contained bundle. Its source and cache bytes match, and sandboxed cache execution passed without source-repository access. The plugin has no MCP Apps widget. The imported application presents Graph, Kanban, List, and Inspector with the independent `Codex` theme, but it is not yet connected to the MCP fixture through an adapter.

The GitHub Actions workflow exists, and its badge and Actions page provide hosted status for public commits. This is a public local-evaluation release, not a public-directory submission. Synthetic desktop and mobile screenshots are persisted; true 200% browser zoom and formal Chrome DevTools or Core Web Vitals evidence remain unavailable. The existing Sites project returns `project_not_found`, and no new deployment is claimed. Apache-2.0 licensing and public legal routes are present; live Forge integration, hosted authentication, multitenancy, telemetry, a hosted service, and a public production MCP endpoint are not.

## Audiences and primary decisions

The primary end user needs to recover the structure and rationale of work that spans multiple agent sessions. The user must be able to see canonical identity, relationships, lifecycle, outcome, evidence, provenance, rejected paths, and next-action context without reconciling separate copies manually.

OpenAI product, design, engineering, security, and plugin-review readers must be able to decide whether the interaction model merits further evaluation, which parts could fit Codex, what the security boundary is, and what work remains before a hosted or directory-published integration. Contributors must be able to run, test, and modify the public package from documented interfaces.

## Functional requirements

### PR-01 — One canonical work model

Every work unit must have one stable identity across Graph, Kanban, List, inspector, history, evidence, and Model Context Protocol results. The canonical schemas must represent project or grouping metadata, supported hierarchy, lifecycle, outcome, evidence, provenance, search, pagination, context transfer, changes, conflicts, and capability discovery.

Selection is application view state that references a stable work-unit identifier. Selecting an item cannot create, modify, delete, duplicate, or reparent canonical workgraph data.

Acceptance requires tests showing that switching views, filtering, sorting, selecting, and applying a supported transition neither duplicates nor drops a work unit. Hierarchy validation must reject cycles, orphans, unsupported parent types, and silent invention of canonical entities. Lifecycle and outcome must remain separate explicit fields.

### PR-02 — Graph, Kanban, List, and inspector

Graph must explain relationships and branching without treating position as canonical hierarchy. Kanban must show and, when permitted, request valid lifecycle transitions. List must provide dense keyboard-friendly search, sort, filter, compare, and selection. The inspector must expose identity, hierarchy, lifecycle, outcome, evidence, provenance, rejected-path context, history, and next-action context for the selected unit.

Acceptance requires deterministic fixture tests showing the same identities and state in all surfaces, keyboard selection and navigation, empty and paginated states, and truthful rendering of unsupported or unavailable operations.

### PR-03 — Creation and material changes

Creation and material edits must use validated input and an explicit preview or confirmation boundary. A local optimistic visual state must not become canonical until the active store confirms it. Conflicts, invalid input, offline state, stale versions, and unauthorized operations must produce structured, recoverable outcomes.

The node-creation form and its confirmation action must remain fully visible and reachable. For every required control at each required viewport, its complete border box must remain inside the viewport. Nine deterministic hit-test samples—the center, four inset corners, and four inset edge midpoints—must resolve to the control or an owned descendant. Any unexpected occluder fails acceptance.

### PR-04 — Theme system and `Codex` theme

The interface must use a first-class registry of semantic theme tokens rather than scattered color literals. It must include a theme named exactly `Codex` whose primary surfaces are white and neutral gray, whose text and borders use neutral gray roles, and whose accents use restrained blue roles. The public description must identify it as an independent Threadwake theme and not an official OpenAI design system.

Theme choice must persist predictably with a deterministic fallback. Theme switching must not cause unreadable flashes, geometry changes, identity changes, graph-semantic changes, or lifecycle regressions. Selection must be keyboard accessible, focus must remain visible, reduced motion must be respected, and lifecycle and outcome must not rely on color alone.

Acceptance requires contrast evidence of at least 4.5:1 for ordinary text and 3:1 for large text, plus at least 3:1 for meaningful non-text marks and focus indicators where applicable. Desktop, phone, short-height, 200% zoom, touch, keyboard, reduced-motion, and nine-point occlusion checks must pass with the `Codex` theme active.

### PR-05 — Deterministic standalone fixture mode

The default public application must run from deterministic synthetic fixtures without an account, credential, hosted service, or Forge installation. Fixture data must be clearly labelled synthetic and contain no personal, medical, workplace, scientific, or conversation-derived records.

Acceptance requires a clean-checkout quick start, stable fixture identifiers and ordering, reproducible screenshots and assertions, no external runtime fetch, and tests for empty, paginated, conflicting, offline, unauthorized, and invalid-schema states.

### PR-06 — Storage and transport boundary

The imported application currently uses its own synthetic domain and state layer. It is not connected to the contracts or MCP fixture through a public application adapter. A future adapter must depend on a narrow versioned boundary, not on fixture internals or Forge-specific fields. It must remain distinct from the implemented server-side `WorkGraphRepository`, whose current implementations are `FixtureWorkGraphStore` and `DisabledForgeWorkGraphStore`. UI components must not become a second canonical source.

Acceptance requires contract tests for capabilities, listing, search, pagination, inspection, evidence retrieval, change preview, supported writes, conflict receipts, and health across every future application adapter. Application tests must also show that selection refers to a stable identifier without changing canonical work. Contract errors must be structured and version mismatches must fail explicitly.

### PR-07 — Model Context Protocol server

The maintainable server supports `fixture` mode and a deliberately disabled `forge` boundary. Its exact 8-tool surface contains capabilities, list, get, search, evidence, preview, confirm, and undo. It does not contain hierarchy attachment, context-update, history-mutation, live Forge-read, or live Forge-write tools. Each tool declares accurate read-only, destructive, idempotent, and open-world annotations. The server enforces schema validation, server-issued previews, version checks, explicit confirmation, idempotency, conflict behavior, and receipts; prompts, skills, and UI state cannot authorize operations.

The implemented fixture write requires a server-issued preview token, current version, explicit confirmation literal, and stable idempotency key. Confirm and undo are destructive because they change in-memory state, idempotent for identical retries, and closed-world. Only the most recently confirmed change on a work unit can be undone, provided no later confirmed change has ever existed on that unit. Undoing it does not reopen earlier receipts, so reversibility is conditional rather than permanent. Acceptance for the local package is established by schema, protocol, standard input/output, HTTP, fixture-store, bundle, and disabled-Forge tests. Hosted permissions, authentication, tenant isolation, and production rollback remain future requirements.

### PR-08 — Optional Forge adapter

The Forge adapter boundary is isolated behind the server and returns unsupported for every operation. Mapping helpers accept explicit fixture-shaped values only. The browser must never contain Forge credentials or call a Forge service directly. No live Forge data or write is part of the implemented package.

Acceptance requires exact mapping tests for supported identity, hierarchy, lifecycle, outcome, evidence, pagination, conflicts, and permissions. Unsupported concepts and unsupported batch idempotency must be reported rather than approximated. Live Forge operation, tenant rules, credentials, and authorization scopes require separate authority and are not initial-release acceptance criteria.

### PR-09 — Repository-scoped Codex plugin

The repository must contain a valid marketplace entry and a valid plugin manifest with a stable kebab-case identity, semantic version, truthful capabilities, accessible public assets, and no placeholder registration identifiers. The bundled skill must explain when to use Threadwake, how to inspect evidence and rejected paths, and how to distinguish reads from material writes.

The plugin contains `.mcp.json`, a deterministic dependency-bundled executable, and generated notices inside the plugin root. The installed cache copy launches and serves all 8 tools while source-repository reads are denied. It does not depend on sibling workspace files, repository-root dependencies, unpublished packages, or network installation at runtime.

The plugin must not include a registered application identifier, interface screenshots, lifecycle hooks, legal URLs, or public-directory claims unless the corresponding real registration, interface, workflow, approved public page, or review status exists and passes the current supported validator.

The current plugin is one skill plus 8 MCP tools and contains no MCP Apps widget. The repository includes the released pure task-link contract and synthetic tests, but no adapter, private snapshot, real host identity, message excerpt, desktop mockup, host switch, or link user interface. The smallest future visual package is a thin, read-only wrapper after a separately reviewed public-safe shell is released. Its public fixtures must remain synthetic, and its URL and persisted widget state must not contain raw task, turn, item, or message identifiers or excerpts.

### PR-10 — Public review and proposal package

Public documentation must explain the problem, current verified state, operating modes, architecture, trust boundaries, tool inventory, theme model, Forge mapping, evaluation commands, limitations, provenance, and external actions still required. It must include a concrete user proposal for Codex and at least five positive and three negative deterministic evaluation cases.

Acceptance requires a first-pass reader test showing that a reviewer can answer what Threadwake adds beyond a conversation list, which parts work today, how the three views share one model, what data leaves the machine, which actions can write, and what feedback or adoption decision is requested. Prose must not imply OpenAI endorsement or directory approval.

## Non-functional requirements

### PR-11 — Accessibility and responsive placement

Desktop and mobile adaptation must be designed and verified together. Required controls must remain usable on desktop, phone, short-height viewports, and at true 200% browser zoom. Keyboard operation, visible focus, reduced motion, non-color state cues, and usable touch targets are mandatory.

Acceptance requires automated checks plus representative browser evidence. Every required action must pass complete-border-box viewport containment and the nine-point occlusion test defined in PR-03. Screenshots are separate supporting evidence and do not replace hit testing.

Current live evidence covers 390 by 844, 390 by 600, and 320 by 568 viewports, a deterministic 2-times text-scale fixture, and a keyboard-safe-area fixture. A machine-validated encoded receipt preserves every required control's border box and both nine-point hit-test result sequences. A separate mobile screenshot shows the complete node-action composer and visible validation control at 390 by 844. This does not establish true browser 200% zoom.

### PR-12 — Security and privacy

Fixture mode must not transmit user work. Connected modes must keep credentials server-side, validate all external input, restrict origins and sessions, apply least privilege, separate reads from writes, resist prompt injection, and avoid secret-bearing errors or logs. A future hosted service must define authentication, authorization, tenant isolation, retention, deletion, redaction, incident response, and support before being represented as production-ready.

Acceptance requires threat-model review, deterministic authorization and prompt-injection tests, high-signal secret scanning, dependency auditing, and confirmation that the public tree contains no credentials, personal context, internal coordination material, local paths, provider receipts, private repository references, or unapproved telemetry.

### PR-13 — Provenance, licensing, and legal readiness

Every public file must be included through an explicit allowlist. Source and asset provenance must be recorded using only public-safe release identifiers and per-file hashes. Third-party code, icons, fonts, screenshots, and generated assets require documented origin, license, and regeneration instructions. Assets with uncertain redistribution rights remain excluded.

First-party code and documentation use Apache License 2.0. The privacy, terms, support, and security routes identify Albert Buchard as publisher and match the plugin metadata. Acceptance requires a compatible dependency-license inventory, synthetic-fixture attestation, public archive review, and exact archive-to-Git tree parity.

### PR-14 — Build, performance, and maintainability

The repository must use npm workspaces, one lockfile, strict TypeScript, declared Node.js and npm support, `npm ci` onboarding, one authoritative Vite configuration, named typed registries for protocol and product literals, and structured validation at external boundaries. Build-only dependencies belong in development dependencies.

The ordinary production bundle must exclude diagnostic instrumentation and permanent observers or timers. Any quality-assurance instrumentation requires an explicit build flag and bounded teardown. The current production entry is 290,384 bytes against a 444,077-byte ceiling and contains no QA markers. The QA build loads its 5.56 kB instrumentation chunk lazily and includes a cleanup regression. These bundle checks do not replace a formal Chrome DevTools and Core Web Vitals audit, which the current tooling cannot run. Acceptance requires clean install, strict type checking, unit and integration tests, production build, focused configuration test, bounded performance comparison, and zero unresolved Critical or High security advisories.

### PR-15 — Public release integrity

The release must contain no inherited non-public Git history. Continuous integration must run the clean-install, type, test, build, plugin, protocol, and public-safety gates appropriate to the committed state. The published tree, reviewed archive, source manifest, and immutable commit must match.

The current workflow runs checksum-pinned Gitleaks before repository-controlled commands, direct dependency-free validation of the exact file manifest, Node.js `22.22.0` and npm `11.12.1`, a clean install, repository-validator and implementation tests, type checks, builds, production and full dependency audits, bundle and notices parity, whitespace checks, and whole-tracked-worktree drift detection. Local and static validation of that definition does not satisfy this requirement. The workflow must pass on GitHub-hosted Ubuntu for the committed release candidate.

Acceptance requires an independent findings-first review with no unresolved Critical or High issue, a successful clone-from-scratch reproduction, passing continuous integration, working documentation and security routes, and a truthful statement that this is an independent user proposal. Public plugin-directory submission is not required and must not occur without separate authorization and the required hosted endpoint, authentication, legal pages, verified identity, and review process.

## Explicit non-goals

The initial release does not provide a live multi-tenant hosted service, production OAuth, universal plugin-directory availability, or live Forge mutation. It does not replace Codex storage, act as a general conversation archive, infer canonical state from visual layout, or reproduce a complete project-management platform. It does not publish realistic personal data, internal project history, uncertain assets, credentials, or unapproved legal commitments. It does not claim that the `Codex` theme is official or that OpenAI has endorsed the product.

## Release decision

The public local-evaluation release requires current evidence, a valid application allowlist, plugin claims that match tested behavior, approved legal and licensing terms, no unresolved Critical or High finding, and release material that distinguishes implementation from future work. Hosted-service or public-directory claims remain prohibited until their separate requirements are satisfied.
