# `@threadwake/mcp-server`

This package exposes a small, fixture-first Model Context Protocol (MCP) surface for the versioned Threadwake workgraph contract. It is designed for local evaluation and automated tests. It is not a hosted service and does not implement production authentication.

The default `fixture` mode uses labelled synthetic records and performs no network or Forge input/output. The optional `forge` mode is an intentionally disabled boundary. Its mapping helper accepts only explicit fixture-shaped values so contributors can evaluate contract mapping without touching a Forge service or user data.

## Tools

The server separates reads from writes:

- `threadwake_get_capabilities`
- `threadwake_list_work_units`
- `threadwake_get_work_unit`
- `threadwake_search_work_units`
- `threadwake_get_evidence`
- `threadwake_preview_fixture_change`
- `threadwake_confirm_fixture_change`
- `threadwake_undo_fixture_change`

The preview tool does not change state. A fixture lifecycle move requires the exact preview token, the current work-unit version, an explicit confirmation literal, and an idempotency key. Undo is allowed only for the latest unreverted change on that work unit and requires another explicit confirmation.

Tool annotations describe actual behavior. Fixture writes are closed-world, local, explicitly confirmed, and idempotent for identical retries. They overwrite fixture state, so they are correctly marked destructive even though the confirmed lifecycle change can be undone while it remains the latest change on that work unit. Prompt-like text inside a title, summary, context field, or evidence record is returned as untrusted data and never interpreted as server policy.

## Run locally

Build from the repository root:

```sh
npm ci
npm run build
```

Run over standard input/output for a process-spawned MCP client:

```sh
node packages/mcp-server/dist/threadwake-mcp.mjs --transport stdio
```

Run an explicit loopback-only Streamable HTTP endpoint:

```sh
node packages/mcp-server/dist/threadwake-mcp.mjs \
  --transport http \
  --host 127.0.0.1 \
  --port 4318 \
  --allow-origin http://127.0.0.1:5173
```

HTTP mode refuses non-loopback bind addresses, validates the `Host` header, rejects unapproved `Origin` values with HTTP 403, limits request bodies, and uses cryptographically generated MCP session identifiers. The only MCP endpoint is `/mcp`; `/health` reports local process availability without returning work data.

## Deliberate limits

- Fixture state is in-memory and resets when the process exits.
- There is no live Forge input/output, hosted endpoint, OAuth, multi-tenant authorization, or plugin-directory registration.
- The build creates a dependency-bundled `dist/threadwake-mcp.mjs` and verifies its byte-identical plugin copy and third-party notices.
- First-party code and documentation in this package are licensed under Apache License 2.0. See the repository's `LICENSE` and `NOTICE` files.
