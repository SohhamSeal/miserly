<div align="center">

<img src="src/assets/miserly-logo.png" alt="miserly" width="132" height="132" />

<h1>miserly</h1>

<p><strong>A frugal AI context optimization studio.</strong></p>

</div>

miserly compresses the context you send to an LLM — deduplicating, minifying,
trimming and restructuring it — so you spend fewer tokens (and less money)
without losing the signal. Everything runs **locally in your browser**; your text
is never uploaded anywhere.

> Paste a prompt, log dump, RAG bundle, JSON blob or transcript → miserly detects
> what it is, plans a compression pipeline, runs it live, and shows you the
> before/after token count, cost savings, and a quality report.

- 🔒 **Local-first & private** — no servers, no telemetry, no uploads.
- 🧮 **Honest metrics** — token reductions are *measured*, not invented (see
  [How the engine works](#how-the-engine-works)).
- 🧩 **Modular & lean** — install only the features you want. The default install
  skips heavy packages and still gives you the full studio experience.
- ⚙️ **Configurable** — a GitHub-style settings panel + environment-variable
  feature flags + an interactive installer.

---

## Table of contents

- [Quick start](#quick-start)
- [Using the studio](#using-the-studio)
- [Features & feature flags](#features--feature-flags)
- [The installer (`npm run setup`)](#the-installer-npm-run-setup)
- [The Settings panel](#the-settings-panel)
- [How the engine works](#how-the-engine-works)
- [Project structure](#project-structure)
- [The proxy (`npm run proxy`)](#the-proxy-npm-run-proxy)
- [Available scripts](#available-scripts)
- [Tech stack](#tech-stack)
- [Contributing](#contributing)
- [License](#license)

---

## Quick start

**Requirements:** [Node.js](https://nodejs.org) 18+ and npm.

```bash
# 1. Clone
git clone <your-fork-url> miserly
cd miserly

# 2. Install (lean by default — no big downloads)
npm install

# 3. (optional) Pick which features to enable
npm run setup

# 4. Run the dev server
npm run dev
```

Then open the URL it prints (usually <http://localhost:5173>).

To create a production build and preview it:

```bash
npm run build     # type-checks, then builds to dist/
npm run preview   # serves the built app locally
```

That's it — no API keys, no environment setup required to get going.

---

## Using the studio

1. **Add your context.** Paste text into the editor, drag-and-drop a file, click
   **Upload**, or hit **Load sample** to try a realistic example.
2. **Pick a goal & budget.** Choose an optimization goal (e.g. *Balanced*,
   *Max compression*, *Highest quality*) and a target token budget. miserly stops
   compressing once your context fits the budget.
3. **Optimize.** Click **Optimize context**. Watch the pipeline run live —
   analysis → classification → planning → compression → validation → assembly.
4. **Review the results.**
   - The **Optimized output** panel shows the compressed text (copy or download it).
   - The **report** breaks down each stage, what it did, and the quality impact.
   - **Cost comparison** estimates the before/after dollar cost per model.
   - **Context budget** visualizes how tokens are allocated across content types.

Everything updates instantly and stays in your browser tab.

---

## Features & feature flags

miserly is split into small features. Each can be toggled, and the **heavy** ones
(big npm downloads) are *opt-in* so the default install stays small.

| Feature | Flag (`.env`) | Default | Heavy? | What you get |
| --- | --- | :---: | :---: | --- |
| Accurate tokenizer | `VITE_FEATURE_ACCURATE_TOKENIZER` | off | ✅ `gpt-tokenizer` (~55 MB) | Exact OpenAI token counts (vs. a fast estimate) |
| Document parsing | `VITE_FEATURE_DOCUMENT_PARSING` | off | ✅ `pdfjs-dist` + `mammoth` (~20 MB) | Upload & extract text from PDF / DOCX |
| Animations | `VITE_FEATURE_ANIMATIONS` | on | — | Smooth live-pipeline motion |
| Rich code editor | `VITE_FEATURE_RICH_EDITOR` | on | — | Syntax-highlighted CodeMirror editor |
| Cost comparison | `VITE_FEATURE_COST_COMPARISON` | on | — | Per-model before/after cost estimates |
| Context budget | `VITE_FEATURE_CONTEXT_BUDGET` | on | — | Token allocation visualization |
| Sample documents | `VITE_FEATURE_SAMPLE_DOCUMENTS` | on | — | One-click realistic examples |

There are **two layers** of control:

- **Build-time flags** (`.env`) decide what gets compiled in. They take effect when
  you (re)start the dev server or rebuild. Copy [`.env.example`](./.env.example) to
  `.env` to edit them by hand, or let `npm run setup` manage them for you.
- **Runtime toggles** (the Settings panel) let you flip features on/off live in the
  browser without a rebuild — your choices are saved in `localStorage`.

> **Why is the heavy stuff a separate download?** A browser bundle must be able to
> *build* even when an optional package isn't installed. miserly solves this by
> generating tiny adapter files: the code that imports a heavy package only exists
> on disk when that package is installed (see [How it works](#how-the-engine-works)).
> When it isn't, miserly falls back gracefully (e.g. a ~4-chars/token estimate).

---

## The installer (`npm run setup`)

Run it any time to choose your features:

```bash
npm run setup
```

It will:

1. Show you each feature (with its install size) and let you multi-select.
2. Install **only** the npm packages needed for the heavy features you picked
   (and remove ones you deselected).
3. Write your choices to `.env`.
4. Regenerate the feature glue so the app reflects your selection.

Then start the app with `npm run dev`.

---

## The Settings panel

Click the **gear icon** (top-right) to open a GitHub-style settings modal:

- **General** — theme (System / Light / Dark), reduce motion, auto-detect content
  type, default optimization goal, default model, and the “How it works” guide.
  These are runtime preferences saved in your browser.
- **Tools & Features** — toggle each feature on/off. Heavy features that aren't
  installed show a disabled toggle with an **Install** button.
- **About** — privacy, what's real vs. simulated, version, license.

### About that in-app **Install** button

When you run miserly **locally with `npm run dev`**, the Install button actually
installs the missing package on your machine (streaming the npm output into the UI),
then reloads so the feature lights up. This works via a small **dev-only** server
endpoint — it is intentionally inert in a production build.

In a built/deployed static site there is no server to run `npm install`, so the
button instead shows you the exact command (`npm run setup`) to run in your
terminal. This is a fundamental browser limitation, not a missing feature.

---

## How the engine works

miserly is **"simulated but honest."** It's a front-end studio, so the heavyweight
ML steps (semantic summarization, embeddings-based retrieval) are *simulated* for
the demo — but the parts that produce the numbers are **real**:

- **Token counting** uses the exact OpenAI tokenizer when installed, otherwise a
  fast ~4-chars/token heuristic. Non-OpenAI families apply *approximate* scaling
  factors — rough estimates, not per-provider tokenizers — and the report labels
  counts with a `~` whenever the exact tokenizer isn't the one that measured them.
- **Structural transforms are genuine** — deduplication, whitespace/JSON
  minification, log collapsing, etc. actually transform your text, so the reported
  token savings are *measured* on the real output, never faked. Each transform
  declares the content types it is safe on and runs through a segmentation guard,
  so a prose reducer never touches a JSON or code segment.
- **Pricing** is an editable, illustrative per-model table (`src/engine/pricing.ts`),
  including cache-read/write rates for the "reused prompt" economics advisory.

The optimization engine is **plugin-based**: each optimizer is a small module that
declares its `provenance` — `native` (miserly's own real transform recipe),
`reference-sim` (an approximation of a named technique), or `external` (wraps the
real library) — and the UI labels them honestly. New optimizers are auto-discovered,
so adding one is just dropping in a file.

### The generated-adapter trick (for the curious)

Optional heavy packages are wired through generated files:

- [`scripts/features.config.mjs`](./scripts/features.config.mjs) is the single
  source of truth for every feature.
- [`scripts/generate.mjs`](./scripts/generate.mjs) reads it + what's installed, then
  emits `src/features.generated.ts` and `src/integrations/generated.ts`, and
  materializes adapter files (e.g. `tokenizer/accurate.ts`) **only** when the
  package is present. These generated files are git-ignored and recreated on
  `postinstall` / `predev` / `prebuild`.

This is why the build never breaks, whether or not you've installed the extras.

---

## Project structure

```
miserly/
├─ scripts/                     # Node-side tooling (no build step)
│  ├─ features.config.mjs       # ← single source of truth for all features
│  ├─ generate.mjs              # generates the feature glue + adapters
│  ├─ setup.mjs                 # interactive `npm run setup` installer
│  ├─ install-feature.mjs       # installs one feature (used by the in-app button)
│  ├─ vite-plugin-installer.mjs # dev-only endpoint behind the Install button
│  └─ lib.mjs                   # shared helpers (.env, npm, package detection)
├─ src/
│  ├─ engine/                   # tokenizer, classifier, planner, runner, plugins
│  ├─ integrations/             # adapter layer for optional packages
│  │  ├─ tokenizer/             # heuristic (always) + accurate.ts.tmpl (opt-in)
│  │  └─ docparse/              # stub + real.ts.tmpl (PDF/DOCX, opt-in)
│  ├─ components/               # UI (panels, editor, settings modal, …)
│  ├─ store/                    # zustand stores (studio state + settings)
│  ├─ config/                   # runtime flag bridge + flag parser
│  ├─ features.ts               # public feature API (wraps generated metadata)
│  └─ data/                     # sample documents
├─ .env.example                 # documented feature flags
└─ vite.config.ts
```

> Files named `*.generated.ts`, `integrations/**/accurate.ts`, and
> `integrations/**/real.ts` are **generated** and git-ignored — don't edit them by
> hand; edit the `.tmpl` templates and re-run `node scripts/generate.mjs`.

---

## The proxy (`npm run proxy`)

miserly can sit **inline between your AI agent and the provider** — the same
architecture as [Headroom](https://github.com/chopratejas/headroom):

```
chat client ──► http://localhost:4141 (miserly proxy) ──► api.anthropic.com
```

```bash
npm run proxy
# then, in another terminal — pick your client:
ANTHROPIC_BASE_URL=http://localhost:4141 claude        # Claude Code
OPENAI_BASE_URL=http://localhost:4141/v1 codex         # Codex / Aider
# Cursor (BYO key only): Settings → Models → Override OpenAI Base URL
#   → http://localhost:4141/v1   (managed Cursor models can't be redirected)
```

Chat requests passing through (`/v1/messages` and `/v1/chat/completions`) get
their **oversized user text and tool blocks** compressed by the same engine the
studio uses (a 120-record JSONL tool dump becomes one TOON table). Everything
else — your question, the model's own words, the system prompt, your API key —
passes through untouched.

**Turning it on and off — no restarts, nothing breaks.** The proxy always
passes traffic through; compression is a *live toggle*:

```bash
curl -X PUT localhost:4141/miserly/config -d '{"enabled":false}'  # bypass
curl -X PUT localhost:4141/miserly/config -d '{"enabled":true}'   # resume
curl localhost:4141/miserly/stats                                 # session savings
curl localhost:4141/miserly/config                                # current settings
```

Every setting is live-editable the same way and persists to
`~/.miserly/config.json`, so your preferences survive restarts. Environment
variables (`MISERLY_PORT`, `MISERLY_UPSTREAM`, `MISERLY_GOAL`, `MISERLY_BUDGET`,
`MISERLY_MIN_TOKENS`, `MISERLY_COMPRESS_SYSTEM`, `MISERLY_MARKER`,
`MISERLY_ENABLED`, `MISERLY_CONFIG_PATH`) still work as session-only overrides.
Defaults worth knowing: each block targets **half its own size** unless you pin
`budget`; blocks under ~1,500 tokens are never touched; the **system prompt is
never compressed by default** — compressing a cached system prompt breaks
provider prompt-caching and can cost you money.

---

## Available scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Start the dev server (regenerates feature glue first) |
| `npm run build` | Type-check and build to `dist/` |
| `npm run preview` | Preview the production build |
| `npm run setup` | Interactive feature installer |
| `npm run generate` | Regenerate the feature glue / adapters manually |
| `npm run typecheck` | Run the TypeScript compiler with no emit |
| `npm run proxy` | Local LLM proxy — compresses requests in-flight on their way to the provider |

---

## Tech stack

React 18 · TypeScript · Vite · Tailwind CSS · Radix UI primitives · CodeMirror 6 ·
Framer Motion · Zustand · `@clack/prompts` (installer).

---

## Contributing

Contributions are welcome! A good first contribution is a new optimizer plugin in
`src/engine/plugins/` or a new feature entry in `scripts/features.config.mjs`.

1. Fork and clone the repo.
2. `npm install`.
3. Make your change; keep `npm run typecheck` and `npm run build` green.
4. Open a pull request describing the change.

---

## License

[MIT](./LICENSE) © 2026 Sohham Seal ([@SohhamS](https://github.com/SohhamS))
