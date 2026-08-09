# Threadwake privacy policy

Effective August 9, 2026

Publisher: Albert Buchard

This policy describes the public Threadwake local-evaluation package. Threadwake currently provides a standalone browser application, a local Codex plugin, and a deterministic Model Context Protocol (MCP) fixture server. It has no developer-hosted service, user account, telemetry service, persistent database, or live Forge connection.

## What Threadwake processes

Threadwake is designed for synthetic local evaluation. It does not need real personal, confidential, or regulated information.

| Category | Purpose and location | Retention and deletion |
| --- | --- | --- |
| Theme preference | Restores the selected theme using the browser's `localStorage` and current URL | Remains until changed or browser storage is cleared; URL history follows the browser's settings |
| Browser view state | Restores navigation using the URL and browser history, including the selected view, synthetic selection identifiers, relationship layers, collapsed columns, date window, and search text | Remove query values or clear browser history |
| Standalone application input and synthetic workgraph state | Demonstrates the interface in the browser's active memory | Resets when the page or fixture is reset or the browser process ends |
| MCP tool inputs and synthetic fixture state | Performs requested local fixture operations in the local MCP process over standard input/output or loopback-only HTTP | Preview, receipt, idempotency, session, and fixture state disappear when the process exits |
| Local protocol and security data | Establishes the local MCP session and enforces loopback, host, origin, and request-size controls | No Threadwake request log or telemetry store is implemented; session state ends with the process |
| Host-product content | Handles content a user deliberately supplies to the host product when using the Threadwake skill | Governed by the host product's settings, privacy policy, and retention controls; Threadwake has no separate hosted copy |

The standalone application and MCP fixture are separate. Browser changes do not flow into the MCP server, and MCP fixture changes do not flow into the browser application. Neither surface reads from or writes to live Forge.

## Purposes and data minimization

Threadwake uses local inputs only to perform the requested action, preserve the active local interaction, enforce preview and confirmation safeguards, and return the relevant synthetic result. The publisher does not use these inputs for advertising, behavioral profiling, cross-site tracking, model training, or sale of personal data.

The local tools are limited to explicit fixture inputs and labelled synthetic records. Threadwake does not request broad conversation history or unrelated context.

## Recipients and disclosures

The current package does not send application or MCP fixture data to a Threadwake developer-operated server. Data may be processed by:

- the user's browser and local operating environment;
- the local Threadwake MCP process and the host process that starts it;
- the host product and its service providers for content supplied through that product, under that product's own terms; and
- a person chosen by the user when the user shares a URL, screenshot, issue report, tool result, or other export.

Threadwake has no subprocessors for a hosted Threadwake service because no such service exists.

## Restricted and sensitive information

Do not enter payment-card data, protected health information, government identifiers, passwords, authentication secrets, API keys, one-time codes, private keys, access tokens, confidential conversations, customer records, workplace records, live Forge data, or another person's personal data into Threadwake fixtures, screenshots, issue reports, or tool inputs. The current package neither needs nor supports these categories.

## User controls and deletion

Users control the current local data path directly:

- Change the theme or clear the application's browser storage to replace or remove the stored theme preference.
- Remove query values and clear browser history to remove locally retained view and search state.
- Reload or reset the standalone application to discard in-memory application changes.
- Stop the local MCP process to discard synthetic fixture changes, previews, idempotency records, receipts, and session state.
- Use the host product's account, retention, and deletion controls for content supplied to that product.
- Do not share URLs, screenshots, logs, or reports containing information you do not want another person to receive.

Threadwake cannot delete data held independently by a host product, browser-sync service, source-control host, issue tracker, or another recipient. Use that recipient's controls.

## Security

The local HTTP transport binds only to a loopback address. It checks the host header and allowed origin, limits request bodies, uses MCP session identifiers, and sends no-store responses. Standard input/output remains within the spawning environment. These controls reduce local exposure but do not make it safe to enter restricted or confidential information.

Report vulnerabilities through [GitHub private vulnerability reporting](https://github.com/albertbuchard/threadwake/security/advisories/new). Do not put vulnerability details or secrets in a public issue.

## Future hosted or connected services

This policy does not describe or authorize a hosted Threadwake service, production authentication, multitenancy, monitoring, persistent logs, a live Forge adapter, or public plugin-directory operation. None is active now.

Before activating any hosted or live-data capability, the publisher will define and publish the applicable data categories, purposes, legal bases where required, recipients, subprocessors, regions, security controls, retention periods, deletion and export routes, backup behavior, incident response, and user controls.

## Contact

For privacy questions or applicable rights requests, open a minimal issue through [GitHub Issues](https://github.com/albertbuchard/threadwake/issues). Do not include personal, confidential, or restricted data. If the request itself contains sensitive information, ask only for a private contact route without posting the details.
