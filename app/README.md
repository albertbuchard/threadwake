# Threadwake application

This workspace is the standalone, fixture-backed Threadwake visual application. It presents the same canonical synthetic work state through Graph, Kanban, and List views. It does not connect to live Forge data, send credentials to a browser, or publish a hosted service.

From the repository root, run `npm ci`, then `npm run dev`. Open the local URL with `?twv=1&view=kanban&theme=codex` to see the six-column lifecycle board in the Codex theme.

The source was imported through the public allowlist in `scripts/public-package/canonical-app-import.json`. Public-boundary changes are limited to packaging, configuration consolidation, synthetic-identity redaction, and release-safety repairs recorded by that manifest and `docs/source-provenance.md`.

The application uses its own synthetic domain and state layer. It is not yet connected to the separate fixture MCP server through an application adapter.

The current application test run passes 15 files with 167 tests, including 13 tests for the released pure Codex task-link contract. The production entry remains 290,384 bytes against a 444,077-byte ceiling and contains no QA instrumentation markers. The QA build loads its 5.56 kB performance chunk lazily and includes a cleanup regression. These checks do not establish true 200% browser zoom or formal Core Web Vitals evidence.

`src/codex-task-links.ts` is a dormant, pure contract. It validates private owner-side source records, keeps raw identities and excerpts out of URL state, and produces task-level host-open requests. This public application includes no private snapshot, real task or message identity, conversation-derived fixture, routing adapter, host switch, or link user interface.
