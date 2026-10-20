# Submission path budget

The complete submission has an 8,388,608-byte limit. The explicit budget for creating `.gitignore` is 1,024 bytes. Its exclusions allocate zero submitted bytes to `node_modules/` at every depth, package caches at every depth, `test/scratch/`, and browser-tool captures in `.playwright-mcp/`. These are generated tooling, not runtime assets. `dist/` is deliberately included.

| Paths | Maximum planned bytes |
| --- | ---: |
| `public/assets/` (original logo, fonts, wallet marks, licenses) | 1,700,000 |
| `dist/` (complete static runtime) | 2,300,000 |
| `src/`, root HTML, build/test scripts, package manifests and lockfile | 500,000 |
| Documentation and `artifacts/` evidence | 750,000 |
| `.gitignore` | 1,024 |
| Dependency/cache/scratch directories | 0 |
| Reserved headroom | 3,137,584 |

Dependencies and browser binaries used for this run were installed in a task-specific temporary directory, outside the repository. They are not delivery assets. There is no vendored registry or submodule. Final measured bytes are recorded in `artifacts/validation.md`; the raw selected-delivery total is below the limit even before Git compression.
