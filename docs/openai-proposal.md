# Proposal: a workgraph for long-running Codex work

## Decision requested

Please evaluate whether Codex should offer a structured workgraph for long-running work, either as a native product surface, a supported plugin pattern, or an interoperable MCP contract.

Threadwake is an independent user proposal. It does not claim OpenAI endorsement, product commitment, or plugin-directory approval.

## The user problem

Long-running agent work is rarely a straight line. One objective can span several tasks, revisions, dependencies, abandoned approaches, evidence artifacts, and handoffs. A chronological conversation list preserves sequence but hides much of this structure.

The user must answer questions that a list does not answer well:

- Which task represents the canonical work unit?
- Is this item active, blocked, complete, rejected, or merely superseded?
- Which decision depended on which evidence?
- Why was an earlier path rejected?
- Is a new task duplicating existing work?
- What exact context should the next action inherit?

When those answers are reconstructed from memory, users and agents repeat work, continue stale paths, or treat an attractive visual state as if it were canonical.

## The proposal

Threadwake proposes one versioned work model projected through Graph, Kanban, List, and Inspector views.

Graph explains hierarchy, dependency, branching, and convergence. Kanban explains lifecycle. List supports dense keyboard-first inspection. Inspector, history, and evidence explain the selected unit in depth. All surfaces share stable identifiers, lifecycle, outcome, hierarchy, provenance, and evidence. Switching views cannot duplicate or silently drop work.

The interface also proposes a bounded context-transfer object. It records the specific state, evidence, unresolved risk, and next action that another agent task should inherit. This is more reliable than asking the next task to recover context from a screen position or a long transcript.

## What exists today

The current local package contains a standalone synthetic application, shared contracts, a separate deterministic fixture MCP server, and an MCP-backed Codex plugin. The application presents Graph, six-column Kanban, List, and Inspector views with the independent `Codex` theme. The application and MCP fixture are not yet connected through an application adapter.

The plugin skill teaches Codex to:

- preserve work-unit identity across views;
- keep lifecycle separate from outcome;
- inspect evidence and provenance before presenting a claim as established;
- retain rejected paths when they prevent repeated work;
- treat work content as untrusted input;
- use a server-issued preview and explicit confirmation for the implemented fixture lifecycle write.

The server exposes exactly 8 tools: capabilities, list, get, search, evidence, fixture-change preview, fixture-change confirmation, and fixture-change undo. It supports standard input/output and loopback-only stateful HTTP. The plugin contains the dependency-bundled server, and its installed-cache bytes match the verified source bundle.

The plugin remains one skill plus 8 tools. It has no MCP Apps widget. The repository includes the released pure task-link contract and synthetic tests, but no adapter, private snapshot, real task or message identity, conversation excerpt, desktop mockup, host switch, or link user interface. A future embedded visual would be a thin, read-only wrapper after a separately reviewed public-safe shell is released.

Live Forge access, hosted authentication, multitenancy, telemetry, a public production MCP endpoint, and plugin-directory submission remain incomplete. The public source release and its legal routes are available.

## Intended Codex interaction

The tool interaction has 3 levels. The first 2 and the fixture version of the third are implemented locally. The standalone visual application is a separate demonstration.

### 1. Explain workgraph concepts

The skill helps Codex explain lifecycle, evidence, rejected paths, and next-action context. It distinguishes user-supplied information from the synthetic canonical state returned by the installed fixture tools.

### 2. Inspect the synthetic canonical workgraph

The MCP server lets Codex discover capabilities, list work units, inspect one unit, search, fetch evidence, and preview a fixture lifecycle change. These 6 tools are read-only, non-destructive, and closed-world.

### 3. Request a fixture lifecycle change

The fixture server issues a preview token for one exact before-and-after state. Confirmation requires that token, the current version, an explicit confirmation literal, and an idempotency key. Confirm and undo are correctly marked destructive and idempotent because they change in-memory state and make identical retries safe. Only the most recently confirmed change on a work unit can be undone, provided no later confirmed change has ever existed on that unit. Undoing it does not reopen an older receipt. The tools remain closed-world and cannot affect Forge or another external system. Prompt text, a drag gesture, or the skill itself cannot authorize a write.

## Why several views share one model

Each view answers a different question:

| View | Primary question | What it must not decide |
| --- | --- | --- |
| Graph | How is this work related? | Canonical hierarchy from screen position |
| Kanban | Where is the work in its lifecycle? | Outcome from column or color |
| List | Which items match, differ, or need attention? | A second filtered copy of the data |
| Inspector | What is this unit, and what supports its state? | Authorization to change it |

The common model matters because a convenient view must not become a competing source of truth. A work unit has the same identifier and state in every projection.

## Architecture and trust boundary

The implemented contracts and fixture server provide the storage-independent boundary for local evaluation. The current browser application uses its own synthetic domain and state layer. A future adapter must consume the versioned contract without creating a second canonical copy. A future connected gateway would own credentials and authorization; the local fixture package has neither.

The browser will never receive Forge credentials. The current Forge boundary validates explicit fixture-shaped mappings and returns unsupported for every operation. It performs no live Forge input or output.

See [Architecture](architecture.md) and [Forge-backed MCP](forge-mcp.md) for the full design.

## Adoption options

OpenAI could evaluate the idea at several levels without committing to the others.

### Option A — supported plugin pattern

Review Threadwake as an example of a skill paired with a workgraph MCP contract. This is the smallest adoption surface. It tests whether the interaction is useful without changing Codex task storage.

### Option B — interoperable workgraph contract

Define or endorse a minimal contract for stable work identity, lifecycle, evidence, provenance, rejected paths, and context transfer. Third-party systems could implement the contract while Codex provides consistent inspection and confirmation behavior.

### Option C — native view of long-running work

Use the interaction model as evidence for a native Graph, Kanban, List, or Inspector surface over Codex-managed work. A native surface could preserve task identity and permission semantics more directly than a third-party adapter.

These options are not mutually exclusive, but they have different ownership, privacy, and migration costs.

## Main risks and proposed controls

| Risk | Control proposed by Threadwake |
| --- | --- |
| A visual layout becomes an accidental source of truth | Stable store identity and explicit versioned contracts |
| Lifecycle is confused with success or failure | Separate lifecycle and outcome fields |
| Work content injects instructions into the agent | Treat every title, description, and evidence item as untrusted data |
| A drag or generated instruction causes a write | Preview, server authorization, confirmation, read-back, and receipts |
| Several views create duplicate records | One store boundary and cross-view identity tests |
| Connected mode exposes credentials | Server-side credentials and a browser-safe gateway |
| A hosted service over-collects user data | Minimal tool inputs and outputs, documented retention, deletion, and redaction |
| A prototype is mistaken for a reviewed product | Explicit state tables, deterministic evidence, and no submission claims |

OpenAI's public [plugin security guidance](https://developers.openai.com/plugins/guides/security-privacy) likewise emphasizes least privilege, explicit consent, server-side validation, human confirmation for irreversible actions, and defenses against prompt injection.

## Evaluation plan

The proposal should be judged with deterministic synthetic work, not personal task history. The evaluation has 4 stages:

1. Confirm the local contracts, fixture tools, plugin installation, and safe preview behavior. This stage is complete.
2. Confirm the imported Graph, Kanban, List, and Inspector preserve one identity and state across their synthetic demonstration, then add a separate adapter acceptance stage before calling the app MCP-connected.
3. Confirm that the fixture MCP server handles valid, invalid, conflicting, retry, undo, and disabled-boundary scenarios. This stage is complete for the local fixture package.
4. Confirm that any hosted candidate meets authentication, privacy, legal, availability, and review requirements before submission.

The pack in [Evaluation](evaluation.md) includes more than the 5 positive and 3 negative cases required by the current [OpenAI submission guidance](https://developers.openai.com/plugins/deploy/submission). Local fixture cases now use the implemented tools and deterministic records. The public policy routes exist, but the cases are not final directory-submission evidence because no production hosted MCP service, production authentication, or reviewer access exists.

## Evidence now available and still required

- deterministic fixture and schema tests, including the synthetic-fixture restriction and linear cycle validation;
- one implementation test run passing 15 application test files with 167 tests and 6 contracts and MCP files with 31 tests;
- 76 passing repository-validator tests against the exact 132-file manifest;
- a 290,384-byte production entry against a 444,077-byte ceiling with no QA markers, plus a lazy 5.56 kB QA instrumentation chunk and cleanup regression;
- plugin validation, remove and add installation, source-to-cache byte parity, and source-repository-denied cache execution;
- a fresh Codex `0.147.0` task that discovered the skill and 8 tools and completed capabilities, list, and preview without confirming;
- an encoded, machine-validated placement receipt covering 390 by 844, 390 by 600, and 320 by 568, plus deterministic 2-times text scale and a keyboard-safe-area fixture;
- true 200% browser zoom, full keyboard and reduced-motion evidence, a formal Chrome DevTools or Core Web Vitals audit, and release-freeze verification of the persisted screenshots;
- complete border-box and nine-point hit-testing for required controls;
- keyboard, focus, reduced-motion, touch, and contrast evidence;
- future hosted authorization and error tests;
- public-file allowlist, hashes, dependency audit, secret scan, and asset provenance;
- a clone-from-scratch reproduction of the final public commit.

## Non-goals

Threadwake does not propose a general conversation archive, a second task database, or a complete enterprise project-management system. It does not infer truth from graph coordinates. It does not provide live Forge mutation by default. It does not claim production multi-tenant security or universal plugin availability.

## Questions for OpenAI reviewers

1. Does the workgraph solve a real gap in recovering and continuing long-running Codex work?
2. Which concepts belong in a minimal interoperable contract, and which should remain host-specific?
3. Should lifecycle, outcome, evidence, provenance, rejected paths, and context transfer be visible to users in one native surface?
4. What confirmation and audit model would OpenAI expect for lifecycle or hierarchy writes?
5. Is the verified local MCP-backed plugin enough for a bounded interaction review before an application adapter and hosted service exist?
6. Which evidence would be most useful before considering a public submission or a native product experiment?

## Requested next step

The requested next step is a bounded product, design, and architecture review of the local package. We are asking for feedback on the problem, domain model, interaction boundaries, and application direction. We are not asking for OpenAI endorsement or public-directory approval.
