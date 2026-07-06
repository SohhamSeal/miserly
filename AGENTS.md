# AGENTS.md — orientation for AI coding agents

miserly is a **local-first LLM-context compression tool**: paste (or proxy)
text on its way to an AI model, and it deduplicates, minifies, re-encodes and
summarizes it so the same meaning costs fewer tokens. Everything runs on the
user's machine — browser studio + optional local proxy. Nothing is uploaded.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Studio dev server on :5173 (regenerates feature glue first) |
| `npx vitest run` | The test suite — **must pass before any commit** |
| `npx tsc --noEmit` | Typecheck — must be clean |
| `npm run build` | Production build (typecheck + vite) |
| `npm run proxy` | Local compression proxy on :4141 (Anthropic + OpenAI shapes) |
| `npm run setup` | Interactive feature installer (heavy optional packages) |
| `npm run generate` | Regenerate feature glue / integration adapters |
| `npm run uninstall` | Clean removal (`-- --dry-run` to preview) |

## Repo map

```
src/engine/            The compression engine — framework-free, the heart
  segmenter.ts         ONE line-type classifier + typed segments + safety guard
  transforms.ts        The toolbox: every text operation, implemented once
  plugins/*.ts         11 optimizers = thin recipes composed from the toolbox
  planner.ts           Goal-scored stage selection (see flowchart in Docs modal)
  runner.ts            Orchestration: closed-loop budget fit, abort, validation
  pricing.ts           Per-model cost tables incl. cache & long-context tiers
  __tests__/engine.test.ts   Regression suite — every past corruption bug is pinned here
src/store/             Zustand stores (studio, pipeline, history, settings)
src/components/        React UI; settings/IntegrationsPanel.tsx drives the proxy
src/integrations/      Adapters for optional heavy packages (see “generated” below)
src/lib/proxyClient.ts Typed client for the proxy's control API
scripts/proxy.mjs      The inline proxy (loads the engine via Vite SSR)
scripts/*.mjs          Installer / generator / uninstaller; features.config.mjs = catalog
docs/product-map.html  Interactive product map (3 tabs); docs/*.md = design docs
```

## Invariants — do not break these

1. **The safety contract.** Risky transforms run through `mapSafeSegments`
   with a declared content-type safe-list; unrecognized lines are protected by
   default (typed structured, or inherit structured neighbors). A prose
   transform must NEVER be able to touch JSON/code. If you add a transform,
   declare its safe types and add corruption tests.
2. **Honest metrics.** Every displayed number is measured, never invented.
   Estimated token counts wear a `~`. Costs that go UP are shown signed and
   red, never clamped to $0. Projections are labeled as projections.
3. **Provenance honesty.** Plugins declare `provenance: "native" |
   "reference-sim" | "external"` and `inspiredBy` credits. Never present a
   simulation as the real research technique, and never claim third-party
   authorship (`author` must not be a research lab).
4. **Precision guard.** Never JSON.parse→stringify round-trip a block whose
   numbers exceed float64 precision (see `hasPrecisionRisk`). Applies to any
   new JSON-rewriting code.
5. **Lean by default.** `gpt-tokenizer`, `pdfjs-dist`, `mammoth` are opt-in
   installs and must NOT be committed to `package.json`. If an in-app install
   ran during testing, revert the manifest before committing.
6. **Generated files are not source.** Never hand-edit
   `src/features.generated.ts`, `src/integrations/generated.ts`, or the
   materialized adapters (`accurate.ts`, `real.ts`) — edit the `.ts.tmpl`
   templates / `scripts/features.config.mjs` and run `npm run generate`.
7. **No AI attributions in commits.** No `Co-Authored-By`, no "generated
   with" trailers. Check `git log` after committing.
8. **Manual pipelines are sacred.** When `manualPlan` is set, run exactly
   those stages — the budget loop must not override user-arranged pipelines.
9. **Privacy.** No external network calls from the studio (fonts are
   self-hosted; the only fetches are localhost). The proxy forwards
   credentials untouched and stores no request content.
10. **Docs travel with behavior.** `docs/product-map.html` is hand-mirrored
    from the code (its MODEL_DATA / OPTIMIZER_DATA tables mirror pricing.ts
    and the plugins). Any user-visible behavior change must update it — and
    the in-app Docs modal where relevant. Drift is this doc's only failure
    mode.

## How the engine fits together (60 seconds)

`classify()` types the document → `planPipeline()` filters plugins by content
type, scores by goal, caps stages (max 2 per category, early-stop when the
budget projection is met — it says so in `reasoning`) → `runOptimization()`
executes with a measured closed loop: if the real output misses the budget it
binary-searches an aggressiveness floor, then re-plans exhaustively before
giving up honestly. Plugins are recipes over `transforms.ts`; the segmenter
guards every risky transform. Validation compares output vs input with real
lexical/entity measurements. The proxy (`scripts/proxy.mjs`) reuses all of
this headlessly via `pace: 0` and Vite SSR module loading.

Notable behaviors people trip over:
- **Balanced goal early-stops** once the projection fits the 8K default
  budget — small inputs get light compression *by design*; use
  `max_compression` or a lower budget for deep squeezes.
- The classifier can never auto-detect `rag`/`knowledge` types — plugins that
  support only those (xRAG) are reachable via manual override only.
- Toonify's TOON tables and the minified-JSON fallback are chosen **per block
  by measured token count** — don't hardcode either choice.

## Verifying changes

1. `npx tsc --noEmit` and `npx vitest run` (56+ tests). Add regression tests
   for any corruption-class fix to `src/engine/__tests__/engine.test.ts`.
2. UI changes: `npm run dev`, test at :5173 — check BOTH themes (light-mode
   contrast bugs have shipped before) and 375px width.
3. Proxy changes: start a mock upstream, then
   `MISERLY_UPSTREAM=http://localhost:<mock> MISERLY_CONFIG_PATH=/tmp/x.json npm run proxy`
   and assert on what the mock receives. Never point tests at real providers.
4. Engine measurements: `src/data/samples.ts` + the enterprise dataset are the
   benchmark fixtures; quote reductions with the `~` estimate caveat.

## Deeper reading

- `design.md` / `ui_design.md` — product & UI intent
- `docs/positioning.md` — competitive stance (incl. honest Headroom comparison)
- `docs/integrations/cursor-mcp-hooks.md` — proxy/MCP/hooks integration design
- `docs/product-map.html` — interactive walkthrough (open in a browser)
- In-app Docs modal — the user-facing explanation incl. the planner flowchart
