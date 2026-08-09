# Threadwake goal alignment

## Executive summary

Threadwake is an independent user proposal for making long-running agent work understandable as one navigable workgraph instead of a loose list of conversations. It is intended for people who need to see what work exists, how items relate, which paths were rejected, what evidence supports a conclusion, and what context the next action should inherit. The public project will present the same canonical work model through Graph, Kanban, and List views, and it will be usable as a deterministic standalone application, a local Codex plugin, and, when separately configured, a client of a Forge-backed Model Context Protocol gateway.

The project is also a review package for OpenAI product, design, engineering, security, and plugin-review teams. It must let a reviewer understand the user problem, the proposed Codex interaction, the implementation boundary, the evidence, and the remaining gaps without access to any non-public context. It is an independent proposal and must not imply OpenAI endorsement, approval, employment, or inclusion in a public plugin directory.

## Current verified state

The repository now contains the allowlisted standalone visual application, implemented shared contracts, separate deterministic synthetic fixtures, a fixture MCP server, public documentation, a repository marketplace, and a validated MCP-backed Codex plugin. The application presents Graph, six-column Kanban, List, and Inspector views. Its `Codex` theme is implemented as an independent Threadwake theme.

The current implementation test run passes 15 application test files with 167 tests and 6 contracts and MCP test files with 31 tests: 21 files and 198 implementation tests in one receipt. The public validator passes 76 tests against an exact 132-file manifest. The production app entry remains 290,384 bytes against a 444,077-byte ceiling and contains no QA instrumentation markers. A QA build loads the 5.56 kB instrumentation chunk lazily and tests teardown. The encoded placement receipt records five responsive scenarios, 12 required controls per scenario, and nine hit-test samples per control.

The plugin contains `.mcp.json`, a dependency-bundled server, and generated third-party notices. Source and installed-cache bytes match. Operating-system sandbox rules denied source-repository reads while the installed cache initialized and exposed all 8 tools. A fresh Codex `0.147.0` task using `gpt-5.6-sol` with extra-high reasoning discovered `threadwake:threadwake` plus the MCP tools and completed capabilities, list, and preview calls without confirming a write.

This is a public local-evaluation release, not a public-directory submission. Synthetic desktop and mobile screenshots are persisted. True 200% browser zoom remains unproved, and the available browser setup cannot perform a formal Chrome DevTools or Core Web Vitals audit. The existing Sites project is inaccessible with `project_not_found`; no replacement site or deployment is claimed. The package has no live Forge integration, production authentication, multitenancy, telemetry, hosted service, or public production MCP endpoint.

The implemented application stack is React 19.2.8, React DOM 19.2.8, TypeScript 7.0.2, Vite 7.3.6, PixiJS 8.19.0, Motion 12.43.0, Phosphor Icons React 2.1.10, Vitest 4.1.10, Testing Library, User Event, jsdom 29.0.1, and CSS custom properties.

## Target outcome

The public project will provide one reproducible repository with four related deliverables:

- A responsive standalone web application that runs against labelled synthetic fixtures by default.
- A versioned contract package that defines the workgraph independently of any storage system or host application.
- A local Model Context Protocol server with deterministic fixture mode and an optional, disabled-by-default Forge adapter.
- A repository-scoped Codex plugin that packages a Threadwake skill and includes local Model Context Protocol tools only if the installed plugin cache can run a self-contained bundled server.

The public documentation will explain which deliverables are implemented, which are simulated, which were verified, and which require external authorization or infrastructure. It will include a concrete proposal for how Codex could use Threadwake without presenting that proposal as an official product direction.

## Users and the problem being solved

The primary user manages work that spans multiple agent sessions, revisions, dependencies, and evidence artifacts. A chronological conversation list does not show the structure of that work. It makes it hard to recover why a decision was made, distinguish an active path from a rejected one, find the next safe action, or see whether two tasks represent the same underlying work.

Threadwake solves this by preserving stable work identity and exposing several views of the same canonical state. A user can move between spatial relationships, lifecycle flow, dense scanning, history, and evidence without creating separate copies of the work. OpenAI reviewers and open-source contributors are secondary users: they need a truthful, reproducible package that makes the interaction model and its security boundary easy to evaluate.

## Core concepts

A **work unit** is the stable canonical object for a goal, task, investigation, decision, or other bounded piece of work. It has one identity even when it appears in more than one view.

A **project or group** is an organizational container. Visual grouping must not invent or silently change canonical hierarchy.

**Hierarchy** records supported parent-child relationships. The system must reject cycles, orphans, and relationships that the backing store does not support.

**Lifecycle** describes where work is in its execution flow. **Outcome** describes what happened, such as completion, rejection, or cancellation. These are distinct fields and must not be inferred from color or view position alone.

**Evidence** is the inspectable support for a claim or outcome. **Provenance** records where a state change or artifact came from. A **rejected path** remains visible enough to explain why it was not pursued.

**Context transfer** is the exact bounded state that a next action or agent session should inherit. It must be explicit, inspectable, and tied to the canonical work unit rather than reconstructed from a visual layout.

## Operating modes

In **standalone fixture mode**, the application uses deterministic, synthetic data. This is the default public visual evaluation path and requires no credentials or external service. The application fixture and the MCP fixture are not yet joined through an adapter.

In **local Codex plugin mode**, the repository-scoped plugin teaches Codex how to inspect the workgraph and packages a self-contained fixture MCP server. The installed cache exposes exactly 8 tools: capabilities, list, get, search, evidence, preview, confirm, and undo. Fixture state is in memory, closed-world, and reset when the process exits.

The plugin contains one skill and those 8 tools. It has no MCP Apps widget. The repository now includes the released pure task-link contract and synthetic tests, but no adapter, private snapshot, real identities, message excerpts, desktop mockup, host switch, or link user interface. The smallest supported visual increment is a thin, read-only wrapper after a separate public-safe shell is released.

In **Forge-backed mode**, the browser talks to an explicit local or remote gateway through versioned contracts. Credentials remain server-side. The Forge adapter is optional, disabled by default, and tested against deterministic contract fixtures. Live Forge reads or writes are not part of the initial public acceptance scope.

## Product goals and measurable success

The project is aligned when all of the following are true:

1. Graph, Kanban, and List render the same stable work identities, lifecycle, outcome, hierarchy, evidence, and provenance without duplication or silent loss.
2. A new reviewer can run the fixture application from a clean checkout, understand its three operating modes, and reproduce the documented tests without non-public context.
3. Every required control remains fully inside the viewport and unobscured on the required desktop, phone, short-height, and 200% zoom checks. The node-creation confirmation action must always remain visible and reachable.
4. The theme registry includes a theme named exactly `Codex`, built from semantic white, neutral gray, and restrained blue tokens. Ordinary text reaches at least 4.5:1 contrast, large text reaches at least 3:1, and meaningful non-text marks and focus indicators reach at least 3:1 where the accessibility standard requires it.
5. Fixture-backed Model Context Protocol tests prove stable identity, deterministic ordering, schema validation, permission handling, conflict behavior, offline behavior, reconciliation, and rollback. Writes remain separate from reads and require explicit server-enforced safeguards.
6. The plugin manifest and marketplace pass the supported validators. Any bundled server runs from the installed plugin cache without repository dependencies or network installation.
7. The public release has zero unresolved Critical or High security advisories, no secret or private-context findings, documented provenance for every included asset, and a reviewed public-file allowlist.
8. Documentation states the current state and limitations precisely enough that a reviewer can distinguish a working local demonstration from a future hosted or directory-approved integration.

## Binding constraints

The canonical application was imported through a source-hash-verified public allowlist. Generated evidence, local configuration, personal data, non-public coordination material, host task or message identifiers, conversation-derived fixtures, and assets without redistribution rights remain excluded. Public fixtures are synthetic and labelled as such.

The imported application currently uses its own synthetic domain and state layer. A future adapter must connect it to the versioned contract without duplicating canonical work. The browser will never receive Forge credentials. The implemented server uses its separate `WorkGraphRepository` boundary to enforce schemas, confirmation policy, idempotency where supported, conflict handling, and receipts. Visual state must never be treated as canonical when it disagrees with the active store.

The public repository uses npm workspaces with one committed lockfile. The current package supports Node.js 22.22.0 or later and pins npm 11.12.1. Build and test dependencies remain development dependencies. One authoritative Vite configuration owns the application build. Ordinary production builds exclude diagnostic instrumentation and unbounded observers or timers.

The public source release uses Apache License 2.0 and approved privacy, terms, support, and security routes under Albert Buchard's public repository identity. Public plugin-directory submission, remote hosting, domain verification, production authentication, and live Forge access remain separate future actions.

The `Codex` theme is a Threadwake theme inspired by a restrained neutral appearance. It is not represented as an official OpenAI design system, and the project does not use protected marks or proprietary assets without documented permission.

## Non-goals

The initial release will not replace Codex task storage, recreate a complete project-management suite, infer canonical hierarchy from screen position, store Forge credentials in the browser, or mutate live Forge data during development or acceptance testing. It will not claim production multi-tenant authentication, universal plugin availability, OpenAI approval, or legal readiness before those conditions are actually met. It will not publish internal planning history, private source history, realistic personal work records, or assets whose rights are uncertain.
