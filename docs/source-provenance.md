# Source provenance

## Current provenance state

This repository is the public Threadwake local-evaluation source release. First-party code and documentation use Apache License 2.0. The exact public commit on `main`, the allowlisted file manifest, and a source archive derived from that commit form the immutable public identity.

The standalone application and the released pure Codex task-link contract were imported through the public allowlist at `scripts/public-package/canonical-app-import.json`. That public manifest records 52 source inputs, each with a source path, SHA-256 hash, destination, and either exact-copy or documented public-boundary transformation status. It also lists public-only files and excluded source classes.

The public manifest uses the sanitized import identifier `threadwake-public-app-import-2026-08-09-r2`, records the exact 52-file source allowlist, and preserves one source SHA-256 per allowlisted entry. The task-link source is byte-identical to its released source. Its synthetic test changes only one internal programme-stream comment into a direct public privacy statement; the executable test logic and fixture values are unchanged. The manifest deliberately omits non-public source locations, Git object identities, whole-tree digests, handoff receipts, provider identifiers, and coordination records. The private source mapping remains outside this repository.

The exact public-package manifest contains 132 files and passes 76 repository-validator tests. The validator rejects an added, missing, renamed, or unlisted file and verifies the imported application hashes, legal routes, plugin package, security boundaries, and privacy exclusions.

## Public-boundary changes

The import keeps source changes narrow and inspectable. Its documented transformations cover public packaging, one authoritative Vite and TypeScript configuration, synthetic-identity replacement, browser chrome color, keyboard regression coverage, and performance-instrumentation gating and cleanup.

The public application fixture uses fictional identities and an example repository. It does not contain host task, turn, item, or message identifiers; message excerpts; conversation-derived fixtures; unreleased desktop mockup or host-switch behavior; private Sites metadata; or private coordination material.

## Public provenance rule

Public provenance records only:

- a sanitized release identifier;
- allowlisted public paths;
- SHA-256 hashes of frozen public bytes;
- an approved public source commit or digest already present in the public manifest;
- first-party modifications made within the public repository;
- third-party origin, license, and regeneration information needed to redistribute an included file.

It must never disclose non-public source locations, private handoff records, host task or message identifiers, coordination records, local user paths, deployment receipts, or provider metadata.

## Release identity

Every public commit has a Git object identifier and a corresponding source archive. A release receipt should record the following fields without editing the release tree merely to insert its own resulting commit hash:

```yaml
release_id: threadwake-public-YYYY-MM-DD-rN
status: sealed
public_commit: PUBLIC_COMMIT_AFTER_PUSH
archive_sha256: SHA256_OF_REVIEWED_ARCHIVE
manifest_sha256: SHA256_OF_ALLOWLIST_MANIFEST
files:
  - path: PUBLIC_RELATIVE_PATH
    sha256: SHA256_OF_FILE_BYTES
    origin: first-party | generated | third-party
    license: APPROVED_SPDX_IDENTIFIER_OR_NOT_APPLICABLE
    regeneration: DOCUMENTED_COMMAND_OR_NOT_APPLICABLE
```

The manifest does not hash itself. Its SHA-256 belongs in a release receipt or release description and must match the public commit and archive.

## Excluded material

The release package excludes:

- dependencies, build output, caches, coverage, logs, and temporary files;
- environment files, credentials, tokens, cookies, database paths, and local configuration;
- non-public planning, coordination, audit, or task records;
- local paths, provider receipts, deployment identifiers, and unpublished hosting metadata;
- host task, turn, item, and message identifiers or excerpts;
- realistic personal, workplace, scientific, medical, or conversation-derived fixtures;
- raw browser dumps and private QA receipts;
- reference images, screenshots, fonts, icons, or snippets with uncertain redistribution rights;
- inherited non-public Git history.

## Asset and screenshot provenance

The plugin marks and screenshots are first-party files. Fontsource packages, Phosphor icons, and other dependencies retain their licenses and are covered by the package lockfile and generated third-party notices. File presence alone is not evidence of third-party rights.

Two first-party screenshots are persisted from the local public build and its labelled synthetic application fixture:

| Path | Viewport and state | SHA-256 | Origin and release status |
| --- | --- | --- | --- |
| `docs/assets/threadwake-codex-workgraph-desktop.jpg` | 1600 by 1000; Graph, `Codex` theme; `Build the chronological alternative` selected with its inspector expanded | `74f0c5eb7f1f8ead758ad739f64189559f3147d19ba7057c717e9b9257d861b8` | Browser-generated first-party image from first-party source and the synthetic fixture; released under the repository license |
| `docs/assets/threadwake-codex-node-composer-mobile.jpg` | 390 by 844; Graph → Chronological list → first `Start from here`; `Plan next action` selected | `f7ab6bbdc7cd3639cde0f5f29bb349001f2e8dfedf2ac69b1164002ddd36d724` | Browser-generated first-party image from first-party source and the synthetic fixture; released under the repository license |

To regenerate them, run the production preview on an unused loopback port, open `/?twv=1&view=graph&theme=codex`, set the stated viewport, reproduce the stated synthetic interaction, and capture the visible viewport as JPEG. A release freeze must repeat this procedure from the immutable candidate, compare the visible state with these files, and update the hashes if the reviewed bytes change. Neither image contains a real task, message, Forge record, person, deployment identifier, or conversation-derived fixture.

## Fixture attestation

Every release fixture must be labelled synthetic. The release receipt must affirm that no personal conversation, live Forge record, customer record, workplace task, medical record, scientific subject record, or other sensitive source was transformed into the fixture.

## Verification procedure

At release freeze:

1. Freeze and verify the exact tracked-file allowlist.
2. Inspect file types and sizes.
3. Run secret, privacy, internal-context, and sensitive-fixture scans.
4. Verify first-party and third-party rights.
5. Hash every allowlisted file with SHA-256.
6. Build a release archive from the allowlist only.
7. Hash the archive and manifest.
8. Compare the archive file list and bytes with the immutable public commit.
9. Reproduce from a fresh clone.

Any mismatch reopens the release gate. Do not edit a hash to fit an unexplained byte change.
