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
| `npm run setup` | Interactive installer: features + optional agent wiring (proxy defaults, aliases) |
| `npm run generate` | Regenerate feature glue / integration adapters |
| `npm run uninstall` | Clean removal (`-- --dry-run` to preview) |
| `npm run proxy:trust` | Export OS-trusted CAs to ~/.miserly/corp-ca.pem (corporate TLS interception) |

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
docs/product-map.html  Interactive product map (4 tabs); docs/*.md = design docs
```

## Invariants — do not break these

1. **The safety contract.** Risky transforms run through `mapSafeSegments`
   with a declared content-type safe-list; unrecognized lines are protected by
   default (typed structured, or inherit structured neighbors). A prose
   transform must NEVER be able to touch JSON/code. If you add a transform,
   declare its safe types and add corruption tests.
2. **Honest metrics.** Every displayed number is measured, never invented.
   Estimated token counts wear a `~`. Costs that go UP are shown signed and
   red, never clamped to $0. Projections are labeled as projections. The
   proxy's activity feed applies the same rule to absences: every chat
   request gets a row, untouched blocks record WHY they were skipped
   (below-threshold / instruction-block / no-gain), bypassed and legacy
   passthrough requests still appear, and failed/cancelled requests carry
   their status — never drop a row to make the feed look cleaner.
3. **Provenance honesty.** Plugins declare `provenance: "native" |
   "reference-sim" | "external"` and `inspiredBy` credits. Never present a
   simulation as the real research technique, and never claim third-party
   authorship (`author` must not be a research lab).
4. **Precision guard.** Never JSON.parse→stringify round-trip a block whose
   numbers exceed float64 precision (see `hasPrecisionRisk`). Applies to any
   new JSON-rewriting code.
5. **Lean by default.** `gpt-tokenizer`, `pdfjs-dist`, `mammoth` are opt-in
   installs and must NOT appear in `package.json`. The installer uses
   `npm install --no-save`, so the manifest stays pristine by construction —
   if you ever see it modified with heavy deps, restore it before committing.
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
   credentials untouched and stores no request content by default — the
   activity feed records metadata only; full text is kept ONLY behind the
   explicit "capture request content" opt-in, in a memory-only ring buffer,
   never on disk.
10. **Docs travel with behavior.** `docs/product-map.html` is hand-mirrored
    from the code (its MODEL_DATA / OPTIMIZER_DATA tables mirror pricing.ts
    and the plugins). Any user-visible behavior change must update it — and
    the in-app Docs modal where relevant. Drift is this doc's only failure
    mode.
11. **The proxy's hands-off contract.** The proxy compresses user-side text
    and tool output in exactly three endpoints — `/v1/messages`,
    `/v1/chat/completions`, `/v1/responses` (Codex CLI's default). It must
    NEVER rewrite: assistant/model text, `function_call` / reasoning items,
    injected instruction blocks (the `INSTRUCTION_TAGS` list:
    `<system-reminder>`, `<user_instructions>`, `<environment_context>`),
    the system prompt / `instructions` field (unless `compressSystem`), API
    keys, or `/v1/messages/count_tokens` bodies (compressing a count probe
    skews the numbers the client budgets with). Legacy `/v1/completions` /
    `/v1/complete` pass through uncompressed (recorded as passthrough). If
    you add an endpoint or body walker, keep this list intact.

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
   (PowerShell: `$env:MISERLY_UPSTREAM='http://localhost:<mock>'; $env:MISERLY_CONFIG_PATH="$env:TEMP\x.json"; npm run proxy`)
   and assert on what the mock receives. Never point tests at real providers.
4. Engine measurements: `src/data/samples.ts` + the enterprise dataset are the
   benchmark fixtures; quote reductions with the `~` estimate caveat.

## Deeper reading

- `design.md` / `ui_design.md` — product & UI intent
- `docs/positioning.md` — competitive stance (incl. honest Headroom comparison)
- `docs/integrations/cursor-mcp-hooks.md` — proxy/MCP/hooks integration design
- `docs/product-map.html` — interactive walkthrough (open in a browser)
- In-app Docs modal — the user-facing explanation incl. the planner flowchart
