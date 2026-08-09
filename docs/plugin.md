# Codex plugin package

## Current plugin state

Threadwake is a validated, locally installable, MCP-backed Codex plugin. Installed version `0.1.0+codex.20260809134453` contains:

```text
.agents/plugins/marketplace.json
plugins/threadwake/
  .codex-plugin/plugin.json
  .mcp.json
  assets/
  server/threadwake-mcp.mjs
  server/THIRD_PARTY_NOTICES.txt
  skills/threadwake/SKILL.md
```

`.mcp.json` points only to `server/threadwake-mcp.mjs` inside the plugin. The server exposes the deterministic in-memory synthetic fixture. The current plugin is one skill plus 8 tools. It does not contain `.app.json`, an MCP Apps widget, lifecycle hooks, plugin UI screenshots, a remote registration identifier, or a hosted MCP connection.

This is an independent plugin proposal. It is not published in the universal plugin directory and is not endorsed by OpenAI.

The manifest identifies Albert Buchard as publisher, declares Apache License 2.0, and links to the public repository, [privacy policy](../PRIVACY.md), and [terms](../TERMS.md). Ordinary support uses [GitHub Issues](https://github.com/albertbuchard/threadwake/issues), and vulnerabilities use [private vulnerability reporting](https://github.com/albertbuchard/threadwake/security/advisories/new).

## What the skill does

The Threadwake skill helps Codex reason about long-running work supplied in the task. It tells Codex to preserve stable work identity, distinguish lifecycle from outcome, inspect evidence and provenance, retain useful rejected paths, and describe the exact context a next action should inherit.

The installed tools make that safe write posture executable for fixture lifecycle changes. Codex can read capabilities and state, request a server-issued preview, show the exact change, and confirm only with the preview token, current version, confirmation literal, and idempotency key. The server does not expose hierarchy attachment, context-update, or history-mutation tools.

## Local repository marketplace

OpenAI documents repo-scoped marketplaces at `.agents/plugins/marketplace.json` and plugin folders under `plugins/`. The plugin source path is relative to the repository marketplace root. See [Package your plugin](https://developers.openai.com/plugins/build/plugins).

To inspect the current plugin:

1. Open this repository in Codex or Work mode in the ChatGPT desktop app.
2. Restart the desktop app if **Threadwake Local** does not appear as a plugin source.
3. Install **Threadwake** from that local source.
4. Start a fresh task so plugin discovery does not rely on an earlier task state.
5. Ask Threadwake to get capabilities, list the synthetic units, and preview one lifecycle change.
6. Verify that preview does not change state and that Codex does not confirm without explicit user confirmation.

The marketplace declares `ON_USE` authentication policy. The local fixture server itself has no account or authentication flow. The policy does not claim that hosted sign-in exists.

## Package checks

These checks confirm the committed package shape:

```sh
node -e "JSON.parse(require('fs').readFileSync('.agents/plugins/marketplace.json','utf8')); JSON.parse(require('fs').readFileSync('plugins/threadwake/.codex-plugin/plugin.json','utf8'))"
test -f plugins/threadwake/skills/threadwake/SKILL.md
test -f plugins/threadwake/assets/threadwake-mark.svg
test -f plugins/threadwake/assets/threadwake-mark-dark.svg
test -f plugins/threadwake/.mcp.json
test -f plugins/threadwake/server/threadwake-mcp.mjs
test -f plugins/threadwake/server/THIRD_PARTY_NOTICES.txt
test ! -e plugins/threadwake/.app.json
```

The supported plugin validator passed. Remove and add testing installed version `0.1.0+codex.20260809134453`. Source and installed-cache server bytes match. The operating-system sandbox denied reads from the source repository while the installed cache initialized and exposed 8 tools.

## Installed-cache evidence

OpenAI plugin packages can include `.mcp.json` for a bundled MCP server or `.app.json` for a registered server connection. The [official packaging guide](https://developers.openai.com/plugins/build/plugins) requires the manifest at `.codex-plugin/plugin.json` and keeps optional components at the plugin root.

Threadwake passed the local bundled-MCP conditions:

1. The deterministic build produced a dependency-bundled executable and generated third-party notices inside `plugins/threadwake/`.
2. The installed executable ran without sibling workspace files, repository-root dependencies, unpublished packages, network installation, or source-repository access.
3. The installed cache initialized and exposed all 8 tools.
4. A fresh Codex `0.147.0` task using `gpt-5.6-sol` with extra-high reasoning discovered `threadwake:threadwake` and the MCP tools.
5. That task completed capabilities, list, and preview calls without confirming a write.
6. The plugin's contracts and MCP coverage passes 6 files with 31 tests. The current implementation test run also passes 15 application files with 167 tests, for 21 files and 198 implementation tests in one receipt.

An `.app.json` file will not be added until a real MCP server connection has been registered through the supported developer flow and a real registration identifier exists. A placeholder identifier would be misleading.

The repository now includes the released pure task-link contract and synthetic tests. The plugin does not expose that contract through a widget or adapter and includes no private snapshot, real identity, or conversation-derived fixture. The smallest future visual increment is a thin, read-only MCP Apps wrapper after a separately reviewed public-safe shell is released. It must not duplicate the unreleased desktop mockup, host switch, or owner-only interface. Raw task, turn, item, and message identities or excerpts must never enter public fixtures, URL state, or persisted widget state.

## Exact local tool boundary

The installed fixture server exposes exactly these 8 tools:

| Tool | Kind and metadata | Behavior |
| --- | --- | --- |
| `threadwake_get_capabilities` | Read-only, non-destructive, closed-world | Returns mode, contract version, the 8 capabilities, and limits |
| `threadwake_list_work_units` | Read-only, non-destructive, closed-world | Lists deterministic synthetic units with filters and cursor pagination |
| `threadwake_get_work_unit` | Read-only, non-destructive, closed-world | Gets one unit with parent, children, and explicit relations |
| `threadwake_search_work_units` | Read-only, non-destructive, closed-world | Searches synthetic identifiers and text as inert data |
| `threadwake_get_evidence` | Read-only, non-destructive, closed-world | Gets evidence attached to one synthetic unit |
| `threadwake_preview_fixture_change` | Read-only, non-destructive, closed-world | Issues the preview required for one fixture lifecycle change |
| `threadwake_confirm_fixture_change` | Write, `destructiveHint: true`, `idempotentHint: true`, closed-world | Applies the exact previewed in-memory change; conditionally undoable only until a later change is confirmed on that work unit |
| `threadwake_undo_fixture_change` | Write, `destructiveHint: true`, `idempotentHint: true`, closed-world | Undoes only the most recently confirmed change and never reopens an earlier receipt |

The confirm and undo tools are correctly marked destructive because the MCP SDK defines state-changing operations as destructive even when the state is local and in memory. `idempotentHint: true` means an identical retry with the same key returns the same receipt; it does not make a different request with that key valid. `openWorldHint: false` means the fixture tools do not affect an external or public system. Only the most recently confirmed change on a work unit can be undone, and only if no later confirmed change has ever existed on that unit. Undoing it does not reopen an earlier receipt. These annotations do not replace server validation or explicit confirmation.

## Public source distribution is not directory publication

A repository marketplace supports authoring, testing, and scoped distribution. Publishing its source repository is separate from the universal plugin directory shared by ChatGPT and Codex.

A public submission would require a final plugin bundle or production MCP server, verified publisher identity, Apps Management write permission, public website and policy routes, a stable production endpoint where applicable, authentication, domain verification, accurate tool metadata, reviewer-ready fixtures or credentials, and formal review. The current [OpenAI submission guide](https://developers.openai.com/plugins/deploy/submission) also asks for at least five positive and three negative test cases.

The verified local bundle is not a directory submission. Publisher and policy metadata are present, but Threadwake has no stable public production MCP endpoint, hosted authentication, domain-verification receipt, or directory review. See [External actions still required](external-actions-required.md).

## Disable or remove

Use the ChatGPT desktop app's plugin controls to disable or uninstall the local Threadwake plugin. Restart the app and open a fresh task to confirm that the skill is no longer available. Do not hand-edit Codex installation state to simulate an uninstall receipt.
