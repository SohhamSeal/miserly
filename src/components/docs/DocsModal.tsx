import { useState, type ReactNode } from "react";
import {
  BookOpen,
  Boxes,
  Cpu,
  HelpCircle,
  Lightbulb,
  Rocket,
  ShieldCheck,
  SlidersHorizontal,
  Terminal,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { FEATURE_META } from "@/features";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tip } from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

type SectionId =
  | "start"
  | "engine"
  | "features"
  | "config"
  | "settings"
  | "privacy"
  | "faq";

const SECTIONS: { id: SectionId; label: string; icon: ReactNode }[] = [
  { id: "start", label: "Getting started", icon: <Rocket className="h-4 w-4" /> },
  { id: "engine", label: "How it works", icon: <Cpu className="h-4 w-4" /> },
  { id: "features", label: "Features", icon: <Boxes className="h-4 w-4" /> },
  { id: "config", label: "Flags & installer", icon: <Terminal className="h-4 w-4" /> },
  { id: "settings", label: "Settings", icon: <SlidersHorizontal className="h-4 w-4" /> },
  { id: "privacy", label: "Privacy", icon: <ShieldCheck className="h-4 w-4" /> },
  { id: "faq", label: "FAQ & tips", icon: <HelpCircle className="h-4 w-4" /> },
];

// ---------------------------------------------------------------------------
// Doc primitives
// ---------------------------------------------------------------------------

function PanelHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="mb-1">
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      <p className="text-sm text-muted-foreground">{subtitle}</p>
    </div>
  );
}

function H({ children }: { children: ReactNode }) {
  return (
    <h3 className="mb-1.5 mt-6 text-sm font-semibold tracking-tight text-foreground">
      {children}
    </h3>
  );
}

function P({ children }: { children: ReactNode }) {
  return <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{children}</p>;
}

function Code({ children }: { children: ReactNode }) {
  return (
    <code className="rounded bg-secondary/70 px-1.5 py-0.5 font-mono text-[0.82em] text-foreground">
      {children}
    </code>
  );
}

function CodeBlock({ children }: { children: ReactNode }) {
  return (
    <pre className="mt-3 overflow-x-auto rounded-lg border border-border bg-secondary/40 p-3 font-mono text-xs leading-relaxed text-foreground/90">
      {children}
    </pre>
  );
}

function Steps({ items }: { items: { title: string; body: ReactNode }[] }) {
  return (
    <ol className="mt-3 space-y-3.5">
      {items.map((it, i) => (
        <li key={i} className="flex gap-3">
          <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-primary/15 text-xs font-semibold text-primary">
            {i + 1}
          </span>
          <div className="min-w-0">
            <div className="text-sm font-medium text-foreground">{it.title}</div>
            <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground">{it.body}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

function Bullets({ items }: { items: ReactNode[] }) {
  return (
    <ul className="mt-2 space-y-1.5">
      {items.map((it, i) => (
        <li key={i} className="flex gap-2.5 text-sm leading-relaxed text-muted-foreground">
          <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-primary/50" />
          <span>{it}</span>
        </li>
      ))}
    </ul>
  );
}

function Callout({
  icon,
  tone = "info",
  children,
}: {
  icon: ReactNode;
  tone?: "info" | "success";
  children: ReactNode;
}) {
  const tones = {
    info: { box: "border-primary/30 bg-primary/10", icon: "text-primary" },
    success: { box: "border-success/30 bg-success/10", icon: "text-success" },
  } as const;
  return (
    <div className={cn("mt-4 flex items-start gap-2.5 rounded-lg border p-3", tones[tone].box)}>
      <span className={cn("mt-0.5 shrink-0", tones[tone].icon)}>{icon}</span>
      <div className="text-sm leading-relaxed text-foreground/90">{children}</div>
    </div>
  );
}

function Faq({ q, children }: { q: string; children: ReactNode }) {
  return (
    <div className="border-b border-border/60 py-3.5 last:border-0">
      <div className="text-sm font-medium text-foreground">{q}</div>
      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{children}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Panels
// ---------------------------------------------------------------------------

function StartPanel() {
  return (
    <div>
      <PanelHeader
        title="Getting started"
        subtitle="From raw context to a leaner prompt in three steps."
      />
      <Steps
        items={[
          {
            title: "Paste or upload your context",
            body: (
              <>
                Type or paste directly, or drag a file onto the input. Code, logs, JSON, Markdown,
                chat transcripts and RAG bundles all work. With document parsing enabled, PDF and
                DOCX files are extracted too.
              </>
            ),
          },
          {
            title: "Pick a goal and budget, then optimize",
            body: (
              <>
                Choose an optimization goal (Balanced, Max compression, Highest quality, Lowest
                cost, Fastest) and a target token budget, then press{" "}
                <span className="font-medium text-foreground">Optimize context</span>. miserly
                detects the content type, plans a pipeline and runs it live.
              </>
            ),
          },
          {
            title: "Review and copy",
            body: (
              <>
                Check the before/after token count, the cost savings and the quality report — then
                copy the optimized text into your model.
              </>
            ),
          },
        ]}
      />
      <Callout icon={<Lightbulb className="h-4 w-4" />}>
        New here? Load a <span className="font-medium text-foreground">sample document</span> from
        the input panel to watch the whole pipeline run on realistic data instantly.
      </Callout>
    </div>
  );
}

function EnginePanel() {
  return (
    <div>
      <PanelHeader
        title="How it works"
        subtitle="A simulated pipeline — but the numbers are honest."
      />
      <P>
        miserly is a fully local, in-browser studio. The optimization{" "}
        <span className="font-medium text-foreground">algorithms are simulated</span> for this
        prototype, but the <span className="font-medium text-foreground">measurements are real</span>
        : token counts come from an actual tokenizer (or a fast estimate), and the text
        transformations genuinely change the text — so the reduction you see is measured, not
        invented.
      </P>

      <H>The pipeline</H>
      <Steps
        items={[
          { title: "Detect", body: "Classifies the input (code, JSON, logs, prose, mixed…) with a confidence score." },
          { title: "Plan", body: "Selects an ordered set of optimizers suited to that type and your chosen goal." },
          { title: "Compress", body: "Runs each stage live — you watch progress in the pipeline panel." },
          { title: "Validate", body: "Estimates semantic similarity and information retention, and flags risky results." },
        ]}
      />

      <H>Tokens & cost</H>
      <P>
        Token counts are exact when the accurate tokenizer is installed, otherwise a fast
        ~4-characters-per-token estimate. Costs are per-model estimates from editable price tables —
        switch the model in the report to recompute everything instantly.
      </P>
    </div>
  );
}

function FeaturesPanel() {
  return (
    <div>
      <PanelHeader
        title="Features"
        subtitle="What each one does. Toggle them under Settings → Tools & Features."
      />
      <div className="mt-3 flex flex-col gap-2.5">
        {FEATURE_META.map((m) => (
          <div key={m.key} className="rounded-lg border border-border bg-card/60 p-3.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium text-foreground">{m.label}</span>
              {m.heavy ? <Badge variant="outline">{m.sizeLabel ?? "heavy"}</Badge> : null}
              <Badge variant="secondary">{m.default ? "on by default" : "off by default"}</Badge>
            </div>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{m.description}</p>
          </div>
        ))}
      </div>
      <Callout icon={<Boxes className="h-4 w-4" />}>
        Heavy features pull large npm packages, so they ship off by default. Install them from
        Settings → Tools &amp; Features, or with <Code>npm run setup</Code>.
      </Callout>
    </div>
  );
}

function ConfigPanel() {
  return (
    <div>
      <PanelHeader
        title="Feature flags & installer"
        subtitle="Install only what you need — the default install stays lean."
      />

      <H>Interactive installer</H>
      <P>
        Run the installer to choose features interactively. It installs or removes the right npm
        packages, writes your <Code>.env</Code>, and regenerates the glue code:
      </P>
      <CodeBlock>npm run setup</CodeBlock>

      <H>Environment flags</H>
      <P>
        Every feature maps to a <Code>VITE_FEATURE_*</Code> flag (see <Code>.env.example</Code>).
        These are read at build time and decide what is compiled in. Lean defaults keep the heavy
        packages out:
      </P>
      <CodeBlock>
        {`VITE_FEATURE_ACCURATE_TOKENIZER=false
VITE_FEATURE_DOCUMENT_PARSING=false
VITE_FEATURE_ANIMATIONS=true
VITE_FEATURE_RICH_EDITOR=true`}
      </CodeBlock>

      <H>Runtime toggles</H>
      <P>
        Anything already installed can be flipped on or off live in Settings → Tools & Features
        (saved in your browser). When you run the dev server, you can even install a missing feature
        straight from that panel — no terminal needed.
      </P>
    </div>
  );
}

function SettingsGuidePanel() {
  return (
    <div>
      <PanelHeader title="The Settings panel" subtitle="Everything behind the gear icon." />

      <H>General</H>
      <Bullets
        items={[
          <>
            <span className="font-medium text-foreground">Theme</span> — match your system, or force
            light / dark.
          </>,
          <>
            <span className="font-medium text-foreground">Reduce motion</span> — minimize animations
            across the app.
          </>,
          <>
            <span className="font-medium text-foreground">Auto-detect content type</span> — classify
            the input automatically on each run.
          </>,
          <>
            <span className="font-medium text-foreground">Defaults</span> — pre-select the goal and
            pricing model for new sessions.
          </>,
          <>
            <span className="font-medium text-foreground">Show the guide</span> — toggle the 3-step
            walkthrough shown before your first run.
          </>,
        ]}
      />

      <H>Tools & Features</H>
      <Bullets
        items={[
          "Flip installed features on or off — changes apply instantly.",
          "A locked (disabled) toggle means the package is not installed yet.",
          <>
            Use the <span className="font-medium text-foreground">Install</span> button (dev server)
            or copy the command to enable it.
          </>,
        ]}
      />
    </div>
  );
}

function PrivacyPanel() {
  return (
    <div>
      <PanelHeader title="Privacy & local-first" subtitle="Your text never leaves your browser." />
      <Callout tone="success" icon={<ShieldCheck className="h-4 w-4" />}>
        100% local — no servers, no uploads, no telemetry, no accounts.
      </Callout>
      <Bullets
        items={[
          "All detection, compression and validation runs client-side in your browser.",
          "Uploaded files (including PDF / DOCX) are parsed locally and never sent anywhere.",
          "miserly does not call an LLM or any external API with your content.",
          "Once the page has loaded, it keeps working offline.",
        ]}
      />
    </div>
  );
}

function FaqPanel() {
  return (
    <div>
      <PanelHeader title="FAQ & tips" subtitle="Quick answers to the common questions." />
      <div className="mt-2">
        <Faq q="Are the savings real?">
          Yes — the token reductions are measured on genuinely transformed text (deduplication, JSON
          minification, whitespace trimming, restructuring). The optimizer algorithms themselves are
          simulated, so treat the quality scores as indicative rather than guaranteed.
        </Faq>
        <Faq q="Does miserly send my text to an LLM?">
          Never. It only counts and transforms text locally; nothing is uploaded.
        </Faq>
        <Faq q="Why is my token count an “estimate”?">
          The exact tokenizer (gpt-tokenizer) is a large package and is off by default. Enable
          “Accurate tokenizer” in Settings → Tools &amp; Features for exact OpenAI counts.
        </Faq>
        <Faq q="Which inputs compress the most?">
          Repetitive logs, verbose JSON, long chat transcripts and RAG bundles — anything with
          redundancy or heavy structure.
        </Faq>
        <Faq q="Can I change the model prices?">
          Yes. The per-model pricing is illustrative and lives in the engine code, easy to edit.
        </Faq>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Modal shell
// ---------------------------------------------------------------------------

export function DocsModal() {
  const [section, setSection] = useState<SectionId>("start");

  return (
    <Dialog>
      <Tip content="Documentation — how miserly works">
        <DialogTrigger asChild>
          <Button variant="ghost" size="sm" className="text-muted-foreground">
            <BookOpen />
            <span className="hidden md:inline">Docs</span>
          </Button>
        </DialogTrigger>
      </Tip>
      <DialogContent showClose className="max-w-3xl gap-0 overflow-hidden p-0">
        <DialogTitle className="sr-only">Documentation</DialogTitle>
        <DialogDescription className="sr-only">
          How to use miserly, how the engine works, its features and configuration.
        </DialogDescription>
        <div className="flex h-[80vh] max-h-[680px] min-h-[460px]">
          <nav className="w-52 shrink-0 overflow-y-auto border-r border-border bg-secondary/30 p-3">
            <div className="px-2 pb-2 pt-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Documentation
            </div>
            <div className="flex flex-col gap-0.5">
              {SECTIONS.map((sec) => (
                <button
                  key={sec.id}
                  type="button"
                  onClick={() => setSection(sec.id)}
                  className={cn(
                    "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors",
                    section === sec.id
                      ? "bg-card font-medium text-foreground shadow-sm"
                      : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
                  )}
                >
                  {sec.icon}
                  {sec.label}
                </button>
              ))}
            </div>
          </nav>

          <div className="flex-1 overflow-y-auto px-6 py-5">
            {section === "start" ? <StartPanel /> : null}
            {section === "engine" ? <EnginePanel /> : null}
            {section === "features" ? <FeaturesPanel /> : null}
            {section === "config" ? <ConfigPanel /> : null}
            {section === "settings" ? <SettingsGuidePanel /> : null}
            {section === "privacy" ? <PrivacyPanel /> : null}
            {section === "faq" ? <FaqPanel /> : null}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
