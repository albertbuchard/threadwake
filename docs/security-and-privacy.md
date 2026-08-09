# Security and privacy

## Current security posture

The local package contains a standalone synthetic application, shared schemas, a separate deterministic MCP fixture, an in-memory MCP server, and an MCP-backed Codex plugin. The server supports standard input/output and stateful loopback-only HTTP. The installed plugin runs a plugin-contained bundle whose bytes match the verified source bundle.

MCP fixture state resets when the process exits. The standalone application uses labelled synthetic data and is not connected to the MCP server. The package has no live Forge input or output, hosted service, OAuth, multitenancy, telemetry, or persistent database. Data handling by the host product remains subject to that product's settings and terms.

The MCP tools receive only the labelled synthetic fixture and their explicit tool inputs. Separately, the Threadwake skill can help Codex reason about task content that a user supplies to the host product. The host product handles that content under its own settings and terms. The skill does not give the Threadwake MCP server access to live Forge data, another external store, or content outside the host task.

This page is the engineering security model. The public legal commitments and contact routes are in [PRIVACY.md](../PRIVACY.md), [TERMS.md](../TERMS.md), [SUPPORT.md](../SUPPORT.md), and [SECURITY.md](../SECURITY.md).

## Security objectives

Connected Threadwake modes must:

- preserve tenant and work-unit identity;
- keep credentials and authorization decisions server-side;
- request and return only the data needed for the user's action;
- separate reads, previews, and writes;
- require applicable confirmation for material changes;
- treat prompts, work content, evidence, and tool output as untrusted;
- produce useful receipts without exposing secrets or unrelated user data;
- fail closed when identity, permission, version, or capability is uncertain.

OpenAI's [plugin security guidance](https://developers.openai.com/plugins/guides/security-privacy) calls for least privilege, explicit user consent, defense in depth, server-side input validation, careful retention and deletion, log redaction, and human confirmation for irreversible actions.

## Data flow by mode

| Mode | Data source | Network path added by Threadwake | Credentials required by Threadwake | Current state |
| --- | --- | --- | --- | --- |
| MCP-backed plugin | User-supplied host-task content for skill reasoning; labelled synthetic fixture for MCP tools | Local fixture server over standard input/output; no separate Threadwake network path for skill reasoning | None | Verified local package |
| Standalone visual fixture | Labelled synthetic local data | None by default | None | Implemented; not MCP-connected |
| Local fixture MCP | Labelled synthetic in-memory fixture | Standard input/output or loopback-only HTTP | None | Verified |
| Forge-backed MCP | No data; the boundary returns unsupported | None | None | Disabled; no live I/O |
| Hosted MCP | Authorized remote data | Public HTTPS MCP endpoint | Production OAuth or approved equivalent | Not implemented or authorized |

The browser must never receive Forge tokens or call Forge directly.

## Threat model

### Untrusted work content

A title, description, evidence item, attachment, or imported context can contain instructions that try to change tool policy, reveal credentials, choose another tenant, or cause a write.

Controls:

- treat work content as data, not instructions;
- keep tool policy outside model-readable records;
- bind tenant and authorization to the authenticated server context;
- validate identifiers, versions, transitions, and schemas server-side;
- do not accept secrets through elicitation, work fields, or browser content.

### Confused or hidden writes

A drag gesture, generated instruction, or ambiguous tool description can hide a side effect.

Controls:

- separate read, preview, apply, and undo operations;
- make the proposed target, prior state, new state, and consequences visible;
- annotate tools according to their real effects;
- enforce version, server-issued preview, exact confirmation, and idempotency on the server;
- return the before-and-after state and a structured receipt;
- never infer persistence from an animation or optimistic state.

### Cross-tenant access

Cross-tenant access is a future hosted-service risk. Fixture mode has no accounts or tenants, and Forge mode is disabled.

Controls:

- derive tenant scope from the authenticated server session;
- authorize every object access within that scope;
- reject caller-supplied tenant overrides;
- return a minimal denial that does not confirm whether another tenant's object exists;
- test both direct and nested identifiers.

### Stale state and replay

A client can write against an old version or repeat a material action after a timeout.

Controls:

- require expected-version or equivalent concurrency conditions;
- require the exact server-issued preview token and current version;
- use idempotency keys for the implemented fixture confirm and undo operations;
- return conflicts instead of overwriting;
- reconcile with a fresh read after indeterminate failure;
- do not retry non-idempotent writes automatically.

### Credential and log exposure

Tokens, raw prompts, stack traces, internal identifiers, or unrelated user fields can leak through errors and logs.

Controls:

- store credentials only in the gateway's supported secret store;
- validate token issuer, audience, expiry, signature, and scopes;
- redact logs before persistence;
- avoid raw prompt and full-response logging;
- use bounded correlation identifiers that are not returned unless needed;
- return structured public errors without debug payloads.

### Local gateway abuse

A local web page could try to call the loopback MCP server.

Controls:

- refuse non-loopback bind addresses;
- validate the host header and exact allowed origin;
- issue cryptographically generated MCP session identifiers;
- reject browser credentials in URLs;
- limit request bodies and reset state on process shutdown;
- avoid broad cross-origin resource sharing.

## Authentication and authorization

Fixture mode needs no account. Forge-backed mode requires a separately authorized credential path and least-privilege scopes defined by the Forge authority.

A future hosted service that accesses user-specific data must implement the MCP authorization model supported by ChatGPT. OpenAI's [authentication guide](https://developers.openai.com/plugins/build/auth) describes protected-resource metadata, authorization-code flow with PKCE, audience and scope validation, token verification on every request, and `401` challenges that allow the client to reauthorize.

Those controls are requirements, not current implementation claims.

## Tool minimization and annotations

The local server exposes exactly 8 tools: capabilities, list, get, search, evidence, preview, confirm, and undo. It does not expose hierarchy attachment, context updates, history mutation, live Forge reads, or live Forge writes.

The 6 read and preview tools set `readOnlyHint: true`, `destructiveHint: false`, and `openWorldHint: false`. Confirm and undo set `readOnlyHint: false`, `destructiveHint: true`, `idempotentHint: true`, and `openWorldHint: false`.

Confirm and undo are destructive in the MCP SDK sense because they change state. Their state is still local, in memory, closed-world, explicitly confirmed, and safe for identical retries. Only the most recently confirmed change on a work unit can be undone, and only if no later confirmed change has ever existed on that unit. Undoing it does not reopen an earlier receipt. A `reversible` receipt is therefore conditionally eligible for one-level undo, not permanently reversible.

Annotations help host behavior. They never replace authorization, validation, or user confirmation.

## Data minimization

Model-readable and structured results should contain only fields needed to answer the current request. Tool results should avoid:

- access or refresh tokens;
- passwords, cookies, and authorization headers;
- raw prompts and unrelated descriptions;
- private network details and stack traces;
- internal account, trace, deployment, or database identifiers;
- personal data unrelated to the requested work unit;
- full evidence bodies when a minimal summary and user-openable reference suffice.

OpenAI's [review requirements](https://developers.openai.com/plugins/deploy/app-review) specifically call for removing unnecessary personal data, authentication secrets, debug payloads, telemetry identifiers, and unrelated user fields from MCP responses.

## Retention and deletion requirements

The local MCP server stores no Threadwake user work. It keeps only the labelled synthetic fixture and its local change receipts in process memory. The skill may reason about user-supplied task content inside the host product, whose settings and terms govern that content; Threadwake adds no separate persistence or external-store access for it. Before any hosted service is represented as ready, the publisher must define and implement:

- which data categories are processed or stored;
- the purpose and legal basis for each category where applicable;
- default and maximum retention periods;
- deletion and export mechanisms;
- backup deletion behavior;
- log redaction and retention;
- subprocessors and data regions where applicable;
- incident response and user notification routes.

The public privacy policy must match observed tool responses and operational logs. Undisclosed data collection blocks release.

## Security testing requirements

The local package tests application state and interaction, the pure task-link privacy contract, schemas, hierarchy invariants, prompt-like inert data, pagination, server-issued previews, stale versions, confirmation, idempotency, conflicts, undo, standard input/output, loopback HTTP, bundle execution, and the disabled Forge boundary. The current implementation test run passes 15 application files with 167 tests and 6 contracts and MCP files with 31 tests: 21 files and 198 implementation tests in one receipt. Production and full dependency audits report 0 vulnerabilities.

A future hosted implementation must additionally test:

- invalid and oversized schema inputs;
- prompt injection in every model-readable field;
- cross-tenant identifiers and caller-supplied tenant overrides;
- missing, expired, wrong-audience, wrong-issuer, and insufficient-scope tokens;
- unauthorized reads, previews, writes, and undo;
- hosted stale versions, duplicate requests, conflicts, and indeterminate responses;
- hosted offline and backing-service failures;
- secret and personal-data leakage in success, error, and log paths;
- tool annotations against actual side effects;
- dependency vulnerabilities and public-tree secret scanning.

MCP Inspector or an equivalent protocol-level client should verify the future hosted endpoint's initialization, tools, schemas, annotations, representative inputs, invalid inputs, results, errors, and authorization. See the official [MCP server guide](https://developers.openai.com/plugins/build/mcp-server).

## Security reporting

Do not report a vulnerability in a public issue. Follow [SECURITY.md](../SECURITY.md), use the repository's private security-advisory route when it becomes public, and include only the minimum synthetic evidence needed to reproduce the problem. Never submit production credentials, private conversations, live Forge data, or another person's data.
