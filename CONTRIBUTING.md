# Contributing to Threadwake

Thank you for helping make long-running agent work easier to understand and continue.

Threadwake is a public local-evaluation project. Its standalone synthetic application, independent `Codex` theme, shared contracts, deterministic fixture MCP server, and MCP-backed Codex plugin are implemented. The application and MCP fixture are not adapter-integrated. Live Forge access, a hosted service, an MCP Apps widget, and public plugin-directory approval are not present. Please check [the current status](README.md#what-is-available-now) before proposing work.

## Contribution boundary

Good contributions are narrow, reproducible, and honest about what exists. They preserve one canonical work model and do not turn a view, prompt, or local animation into a competing source of truth.

Before opening a pull request:

- search for an existing issue or proposal that covers the same change;
- describe which current or planned surface the change affects;
- use synthetic examples only;
- keep credentials, private conversations, live work records, customer data, workplace material, and live Forge data out of every file and discussion;
- state whether the change can read, write, contact a network service, or affect another system;
- include the smallest relevant test evidence;
- update current-state documentation when a capability becomes real or is removed.

Security vulnerabilities do not belong in public issues. Follow [SECURITY.md](SECURITY.md).

## License and contribution terms

First-party Threadwake code and documentation are licensed under [Apache License 2.0](LICENSE). Unless you state otherwise when submitting a contribution, you agree that your contribution is provided under the same license and that you have the right to provide it.

Do not submit code, art, screenshots, fonts, fixtures, or text unless you have the right to contribute and redistribute it under the repository's terms.

## Propose a change

Use an issue to describe:

1. the user problem;
2. the affected workgraph concept or surface;
3. the expected behavior;
4. the safety and privacy boundary;
5. a deterministic synthetic example;
6. the smallest evidence that would show the change works;
7. any compatibility or migration concern.

For product proposals, explain why the change belongs in Threadwake rather than a separate project-management feature.

## Development setup

The repository contains a pinned npm workspace, committed lockfile, standalone synthetic application, shared contracts, fixture MCP server, and plugin bundle.

Install and verify the local package from the repository root:

```sh
npm ci
npm run check
```

The complete check type-checks the application and both packages, runs implementation tests, builds the contracts, dependency-bundled MCP server, production application, and QA application, then validates the exact public package. The current implementation test run passes 15 application files with 167 tests and 6 contracts and MCP files with 31 tests. The repository validator passes 76 tests against 132 exact files. The implementation total is 21 files and 198 tests in one receipt. The supported Node.js range starts at 22.22.0, and the pinned package manager is npm 11.12.1.

These versions and commands describe the current workspace. Do not add setup instructions that depend on a particular home directory, fixed local port, private service, or mutable global package installation.

Run the visual application with `npm run dev`. Use `?twv=1&view=kanban&theme=codex` on the loopback URL printed by Vite to inspect the six-column Kanban view.

## Documentation style

Put the reader's decision or action first. Use complete sentences, define unfamiliar terms, and separate current behavior from target behavior. One sentence should carry one main claim.

Use these phrases consistently:

- **current** for behavior present and verified in this repository;
- **proposed** or **planned** for behavior without implementation evidence;
- **unsupported** for a deliberate capability boundary;
- **unknown** when evidence is missing.

Do not use internal task labels, local paths, provider receipts, personal names, or non-public source history.

## Code and contract expectations

Code contributions must:

- keep user-interface components behind `WorkGraphStore`;
- preserve stable work-unit identity across Graph, Kanban, List, and Inspector;
- keep lifecycle separate from outcome;
- validate every external boundary;
- use named typed registries for domain and protocol literals;
- separate reads, previews, and material writes;
- enforce authorization and confirmation on the server;
- document unsupported behavior rather than approximate it;
- keep production builds free of permanent QA instrumentation;
- include tests for valid, invalid, permission, conflict, offline, and rollback behavior as applicable.

The implemented MCP surface contains exactly 8 tools: capabilities, list, get, search, evidence, fixture-change preview, fixture-change confirmation, and fixture-change undo. A proposal for hierarchy attachment, context updates, history mutation, live Forge operations, or a broader write surface is a new capability and must not be described as already supported.

The current plugin has no MCP Apps widget. The repository includes the released pure task-link contract and synthetic tests, but no adapter, private snapshot, real host identities, excerpts, desktop mockup, host switch, or link user interface. Do not duplicate those unreleased interface surfaces or add conversation-derived fixtures. A future widget should remain a thin, read-only wrapper after a separately reviewed public-safe shell is released.

## Fixtures and screenshots

Fixtures must be clearly fictional and synthetic. Do not transform a real work record by changing only its names.

Screenshots must come from the deterministic public fixture and the frozen public build. Record the viewport, theme, fixture identifier, and regeneration command. Do not submit screenshots from a personal desktop, account, workplace, or private service.

## Artificial intelligence assistance

If an automated tool materially generated or transformed a contribution, disclose that in the pull request. The contributor remains responsible for correctness, rights, privacy, security, and test evidence. Do not paste non-public context into an external service merely to prepare a contribution.

## Pull-request checklist

Use the repository template. A reviewer should be able to determine:

- what changed and why;
- whether the change matches the current architecture;
- what data and side effects are involved;
- what was tested;
- whether provenance and rights are clear;
- whether documentation states the new status truthfully.

Maintainers may ask for a smaller change when a pull request mixes unrelated concerns or makes evidence difficult to interpret.
