# Security policy

## Report vulnerabilities privately

Do not open a public issue for a suspected vulnerability. Use [GitHub private vulnerability reporting](https://github.com/albertbuchard/threadwake/security/advisories/new).

If that route is unavailable, do not post exploit details, credentials, private work data, or another person's data publicly. Open a minimal issue that says the private security-reporting route is unavailable, without describing the vulnerability, and wait for a secure route.

Publisher: Albert Buchard. Effective August 9, 2026.

No response-time commitment is made. See [SUPPORT.md](SUPPORT.md) for the supported local-evaluation scope.

## Include safe reproduction information

A useful report contains:

- the affected public commit or version;
- the affected component;
- the security boundary that failed;
- minimal steps using synthetic data;
- expected and observed behavior;
- impact stated without unnecessary sensitive data;
- a suggested fix if you have one.

Do not include:

- access tokens, passwords, cookies, private keys, or authorization headers;
- private conversations or realistic work histories;
- customer, workplace, medical, scientific-subject, or live Forge data;
- destructive proof against a service you do not own;
- unrelated system or account information.

Redact evidence before submission. If a secret was exposed, revoke or rotate it through the proper authority rather than relying only on deletion from a report.

## Current supported surface

The current package includes the standalone synthetic application, shared contracts, a separate deterministic MCP fixture, an in-memory MCP server, and an MCP-backed Codex plugin. The server supports standard input/output and stateful loopback-only HTTP. The installed plugin launches a plugin-contained bundle whose bytes match the verified source bundle.

MCP fixture state is held only in memory and resets when the process exits. The application uses labelled synthetic local state and is not connected to the MCP server. The package has no live Forge input or output, hosted endpoint, OAuth, multitenancy, telemetry, or persistent database.

Security reports can still cover the public plugin metadata, skill instructions, documentation, repository automation, or a future component once that component is committed.

Reports can cover application isolation and rendering, contract validation, fixture isolation, preview and confirmation behavior, idempotency, undo, standard input/output, loopback HTTP, plugin packaging, or installed-cache isolation. Claims about the unimplemented application-to-MCP adapter, MCP Apps widget, live Forge connection, hosted service, or authentication should be filed as design or threat-model proposals, not implementation vulnerabilities.

## Security expectations for connected modes

Future connected code must keep credentials server-side, validate external input, bind tenant scope to authenticated context, apply least privilege, separate reads from writes, require applicable confirmation, resist prompt injection, redact logs, and return structured errors without secrets.

See [Security and privacy](docs/security-and-privacy.md) for the engineering threat model.

## Coordinated disclosure

Please allow maintainers a reasonable opportunity to validate and fix a report before public disclosure. Do not test against live user data or external systems without explicit authorization.

If a report is accepted, the eventual advisory should credit the reporter only with their consent and should omit personal or operational detail that is not necessary to understand the issue.
