# astm-e1394

ASTM E1394 (LIS2-A2) messages for Node.js: the record layer that laboratory instruments and
laboratory information systems exchange.

## Layout

A pnpm monorepo in the grouped layout, released with rman.

- `packages/core/core` (`@astm-e1394/core`): parse, build and serialize messages and records.
- `packages/core/dictionary` (`@astm-e1394/dictionary`): record and field definitions.
- `support/`: scripts that build or check the repository, not published.

The repository has one group, `core`, and every package goes into it: all packages release
together, under one version. The E1381 (LIS1-A) transport layer will be `packages/core/net`
(`@astm-e1394/net`), in the same group. The standard has no versions that change its records
(E1394-97 and LIS2-A2 lay them out the same way), so there is one dictionary; an instrument's
own fields and codes go into one made with `dictionary.extend()`, not into the package.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).

## Before every push

Run these in order, and push only when every step passes:

1. `rman deps` - list the dependencies that have a newer version.
2. `rman deps -u` - when step 1 lists any, upgrade them.
3. `rman ci` - delete node_modules and lockfiles and install from scratch.
4. Check: `pnpm run lint`, `pnpm run check`, `rman format --check`.
5. Build and test: `pnpm run build`, `pnpm test`.
6. Push.
