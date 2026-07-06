# Contributing to miserly

Thanks for wanting to make context cheaper for everyone. The rules are short:

## The workflow (no exceptions)

1. **Never commit to `main`.** It's protected — direct pushes are rejected.
2. Fork the repo (or create a feature branch if you have write access):
   `feat/<short-name>`, `fix/<short-name>`, `docs/<short-name>`.
3. Open a **pull request** against `main`.
4. CI must pass (typecheck, tests, build) and the PR needs an approving
   review from the code owner (@SohhamSeal) — that review is mandatory and
   final; it cannot be bypassed or substituted.

## Before you open the PR

```bash
npx tsc --noEmit   # must be clean
npx vitest run     # must pass — add tests for engine/corruption fixes
npm run build      # must succeed
```

Read **AGENTS.md** — its invariants (the transform safety contract, honest
metrics, provenance honesty, lean-by-default, generated-files rules, no AI
attributions in commit messages) apply to humans too. PRs that violate an
invariant will be asked to change regardless of how good the feature is.

## Scope guidance

- Engine changes need regression tests in `src/engine/__tests__/engine.test.ts`.
- Anything user-visible must update `docs/product-map.html` (and the Docs
  modal where relevant).
- Heavy optional dependencies stay out of `package.json` — the feature
  system installs them per-machine (`npm run setup`).
