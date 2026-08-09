# `@threadwake/contracts`

This package is the framework-independent source of truth for Threadwake workgraph data and operations. It contains versioned Zod schemas and inferred TypeScript types. It does not depend on React, Model Context Protocol transports, Forge, or a storage engine.

The contract keeps hierarchy, lifecycle, outcome, evidence, provenance, and next-action context explicit. `WorkGraphDocumentSchema` also checks cross-record invariants such as missing parents, hierarchy cycles, project mismatches, and broken evidence references.

## Public API

Import schemas and types from the package root:

```ts
import {
  CONTRACT_VERSION,
  WorkGraphDocumentSchema,
  type WorkGraphDocument,
} from "@threadwake/contracts";
```

Use `parseWorkGraphDocument` at trust boundaries. It returns a detached, validated value so callers cannot mutate the input object through a retained reference.

## Commands

From the repository root:

```sh
npm run typecheck --workspace @threadwake/contracts
npm run build --workspace @threadwake/contracts
```

First-party code and documentation in this package are licensed under Apache License 2.0. See the repository's `LICENSE` and `NOTICE` files.
