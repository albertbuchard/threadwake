# Threadwake support policy

Effective August 9, 2026

Publisher: Albert Buchard

Use [GitHub Issues](https://github.com/albertbuchard/threadwake/issues) for ordinary support. Use [GitHub private vulnerability reporting](https://github.com/albertbuchard/threadwake/security/advisories/new) for suspected security vulnerabilities. Never post vulnerability details, credentials, confidential information, or another person's data in a public issue.

## Supported local evaluation scope

Support may cover reproducible problems in the published package, including:

- installing dependencies with the documented Node.js and npm versions and committed lockfile;
- building, testing, or running the standalone synthetic browser application;
- using Graph, Kanban, List, Inspector, grouping, lifecycle, theme, and undo behavior with synthetic fixtures;
- launching the deterministic fixture MCP server over standard input/output or loopback-only HTTP;
- using the 8 published local MCP fixture tools;
- installing or validating the repository-scoped Codex plugin;
- understanding documented tool inputs, previews, confirmations, receipts, conflicts, and one-level fixture undo; and
- reporting defects in public code, documentation, tests, plugin metadata, automation, or packaged files.

Support applies to the exact public files and versions released from this repository. Reports about forks should establish whether the issue also occurs in an unmodified public version.

## Unsupported or future scope

The current package does not provide support for:

- a hosted Threadwake service, production endpoint, account, authentication system, multitenant operation, monitoring service, or service-level agreement;
- live Forge access, credentials, synchronization, or production incident response;
- an MCP Apps visual widget or embedded Threadwake interface;
- private conversations, customer or workplace records, regulated data, or real production workgraphs;
- deployment to an unreviewed public network interface or third-party host;
- claims that Threadwake is made, endorsed, approved, or supported by OpenAI; or
- general support for Codex, GitHub, Forge, an operating system, or unrelated third-party software.

## Report an ordinary problem

Open an issue with the smallest reproducible synthetic example. Include:

- the public commit, tag, or version;
- the affected component and operating environment;
- the Node.js and npm versions used;
- exact reproduction steps using synthetic data;
- expected and observed behavior;
- a short, redacted error message; and
- whether it occurs in an unmodified clean checkout.

Do not paste a full environment dump, browser profile, conversation, work history, log archive, or task transcript. Remove credentials, tokens, cookies, authorization headers, personal names, private identifiers, private network details, local filesystem paths, and unrelated diagnostics.

## Report a vulnerability privately

Use the private vulnerability-reporting route and follow [SECURITY.md](SECURITY.md). Include the affected public version, component, failed security boundary, minimal synthetic reproduction, expected and observed behavior, and impact. Do not test against live user data or systems you do not own.

If private reporting is unavailable, open a minimal public issue stating only that the private route is unavailable. Do not describe the vulnerability. If an ordinary issue may expose a security weakness, stop adding public details and move to private coordinated disclosure.

## No response-time promise

Threadwake makes no promise about first response, investigation, fix, release, availability, or resolution time. No service-level agreement applies.

Any future hosted service, live Forge connection, account system, or public plugin-directory release will require a separately published support plan before activation.
