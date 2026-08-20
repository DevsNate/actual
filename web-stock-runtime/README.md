# Stock Web runtime workstream

This workstream makes the preserved deployed YNAB Web client relocatable
against the canonical project server. It does not reimplement the client.

## Provenance labels

- `STOCK_CAPTURE`: immutable browser/runtime observation.
- `STOCK_RUNTIME_ASSET`: raw deployed vendor asset; local-only.
- `CLIENT_PATCH`: minimal infrastructure-boundary patch with before/after hash.
- `OUR_SERVER`: project-owned compatibility or canonical server code.
- `DERIVED_EVIDENCE`: reproducible manifests, graphs, and structural reports.
- `TEST_FIXTURE`: sanitized protocol or runtime fixture admitted to tests.

## Layout

```text
web-stock-runtime/
├── README.md
├── vendor/   # Git-ignored raw runtime assets
├── work/     # Git-ignored patched/served experiment
└── derived/  # Safe manifests, load graphs, patch records, and verification
```

No stock runtime asset may be committed. The first experiment stops at shell,
session/bootstrap, plan picker, and opening one plan.
