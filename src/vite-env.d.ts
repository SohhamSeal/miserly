/// <reference types="vite/client" />

// Build-time feature flags. These are injected by Vite from `.env`
// (see `.env.example`). They are read in `src/features.generated.ts`.
interface ImportMetaEnv {
  readonly VITE_FEATURE_ACCURATE_TOKENIZER?: string;
  readonly VITE_FEATURE_DOCUMENT_PARSING?: string;
  readonly VITE_FEATURE_ANIMATIONS?: string;
  readonly VITE_FEATURE_RICH_EDITOR?: string;
  readonly VITE_FEATURE_COST_COMPARISON?: string;
  readonly VITE_FEATURE_CONTEXT_BUDGET?: string;
  readonly VITE_FEATURE_SAMPLE_DOCUMENTS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
