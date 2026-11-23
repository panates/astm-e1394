# astm-e1394

ASTM E1394 (LIS2-A2) messages for Node.js: the record layer that laboratory instruments and
laboratory information systems exchange.

## Layout

A pnpm monorepo in the grouped layout, released with rman.

- `packages/core/core` (`@astm-e1394/core`): parse, build and serialize messages and records.
- `packages/core/dictionary` (`@astm-e1394/dictionary`): record and field definitions.
- `support/`: scripts that build or check the repository, not published.

The `core` group directory is one version group: its packages release together. The package
names and the group split are still being designed.

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
