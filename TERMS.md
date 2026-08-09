# Threadwake terms of use

Effective August 9, 2026

Publisher: Albert Buchard

These terms apply to the public Threadwake local-evaluation package and its publisher-operated project routes. The [Apache License 2.0](LICENSE) separately governs permission to use, copy, modify, and distribute Threadwake's first-party code and documentation. These terms do not narrow or expand rights granted by that license.

## What Threadwake provides

Threadwake is a local evaluation package for exploring long-running agent work as a workgraph. It includes a standalone synthetic browser application, a local Codex plugin, a deterministic fixture-backed Model Context Protocol (MCP) server, 8 local MCP fixture tools, and standard input/output and loopback-only HTTP transports.

The standalone application and MCP fixture are separate evaluation surfaces. Neither connects to live Forge. The package has no production service, hosted account, persistent database, production authentication, multitenancy, telemetry service, uptime commitment, service-level agreement, or public plugin-directory approval.

## Synthetic evaluation only

Included workgraph fixtures are fictional and labelled synthetic. Local changes affect only active browser state or the active MCP fixture process. Do not use the current package as a system of record, production workflow manager, backup, audit archive, medical or legal record, or control plane for an external service. Verify results before relying on them.

## Safe and lawful use

You are responsible for using Threadwake lawfully and only on systems, data, and accounts you are authorized to use. You must not:

- bypass access controls, origin checks, input limits, confirmation safeguards, or security warnings;
- attack, disrupt, scrape, impersonate, or obtain unauthorized access to any person, system, account, or service;
- present synthetic results as real operational records; or
- deploy the local server beyond approved local interfaces without a separately reviewed security design.

Keep any backups you need outside Threadwake, review changes before confirmation, and comply with the terms of the host product, operating environment, and third-party software you use.

## Restricted data

Do not enter credentials, API keys, passwords, one-time codes, access tokens, payment-card data, protected health information, government identifiers, confidential conversations, customer records, workplace records, live Forge data, or another person's personal information into Threadwake. The package neither needs nor supports that data for its synthetic evaluation purpose.

## Software license and third-party materials

First-party Threadwake code and documentation are licensed under Apache License 2.0. Third-party dependencies, fonts, icons, and other materials remain subject to their own licenses and notices. Host-product processing remains subject to the host product's terms and privacy policy.

## Independent project; no OpenAI affiliation

Threadwake is an independent user proposal. It is not an OpenAI product and is not made, sponsored, endorsed, approved, or supported by OpenAI. Support for a Codex plugin format and links to OpenAI documentation do not create a partnership, employment relationship, agency, certification, or approval.

## No service-level commitment

The current package has no uptime, availability, maintenance, response-time, resolution-time, backup, recovery, compatibility, or service-level commitment. Support follows [SUPPORT.md](SUPPORT.md).

## Disclaimer of warranties

To the maximum extent permitted by applicable law, Threadwake is provided “as is” and “as available,” without warranties of any kind. No promise is made that it will be uninterrupted, secure, error-free, accurate, fit for a particular purpose, or compatible with an external system. Rights that cannot lawfully be excluded remain unaffected.

## Limitation of liability

To the maximum extent permitted by applicable law, the publisher and contributors are not liable for indirect, incidental, special, consequential, or exemplary loss arising from use of or inability to use Threadwake. Their aggregate liability for claims governed by these terms will not exceed the greater of CHF 100 or the amount paid for Threadwake during the 12 months before the event giving rise to the claim.

Nothing in these terms excludes or limits liability where doing so is prohibited by law, including liability for fraud, wilful misconduct, gross negligence, death or personal injury caused by negligence, or mandatory consumer rights.

## Governing law and disputes

These terms are governed by Swiss law, without regard to conflict-of-law rules. Subject to any mandatory consumer jurisdiction, the courts of Geneva, Switzerland have exclusive jurisdiction over disputes arising from these terms.

## Changes and future services

Later releases may use revised terms. A hosted MCP service, live Forge connection, user account, paid service, or public plugin-directory offering would be a materially different service and will require terms, privacy, support, and security commitments that accurately describe it before activation.

## Contact

For questions about these terms, use [GitHub Issues](https://github.com/albertbuchard/threadwake/issues). Do not include personal, confidential, or restricted data. For suspected vulnerabilities, use [private vulnerability reporting](https://github.com/albertbuchard/threadwake/security/advisories/new).
