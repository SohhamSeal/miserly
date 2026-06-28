import { useEffect } from "react";
import { AlertTriangle, ClipboardPaste, Copy, Sparkles } from "lucide-react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useStudioStore } from "@/store/useStudioStore";
import { useFeatureEnabled, useSettingsStore } from "@/store/useSettingsStore";
import { ThemeController } from "@/components/ThemeController";
import { Header } from "@/components/Header";
import { HistorySidebar } from "@/components/HistorySidebar";
import { InputPanel } from "@/components/InputPanel";
import { OptimizeBar } from "@/components/OptimizeBar";
import { LiveProgress } from "@/components/LiveProgress";
import { OutputPanel } from "@/components/OutputPanel";
import { ReportCard } from "@/components/ReportCard";
import { CostVisualization } from "@/components/CostVisualization";
import { ContextBudgetVisualization } from "@/components/ContextBudgetVisualization";

function HowItWorks() {
  const steps = [
    { icon: <ClipboardPaste className="h-4 w-4" />, title: "Paste or upload", body: "Drop in logs, code, JSON, docs or chat history." },
    { icon: <Sparkles className="h-4 w-4" />, title: "Optimize", body: "miserly detects the type, plans a pipeline and compresses." },
    { icon: <Copy className="h-4 w-4" />, title: "Copy", body: "Take the smaller prompt and send it to your model." },
  ];
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {steps.map((s, i) => (
        <div
          key={i}
          className="flex items-start gap-3 rounded-xl border border-border bg-card/60 px-4 py-3"
        >
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary/15 text-primary">
            {s.icon}
          </span>
          <div>
            <div className="text-sm font-medium">
              <span className="mr-1.5 text-muted-foreground">{i + 1}.</span>
              {s.title}
            </div>
            <p className="text-xs text-muted-foreground">{s.body}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

function ErrorBox({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <div>
        <div className="font-medium">Optimization failed</div>
        <div className="text-destructive/80">{message}</div>
      </div>
    </div>
  );
}

export default function App() {
  const status = useStudioStore((s) => s.status);
  const result = useStudioStore((s) => s.result);
  const error = useStudioStore((s) => s.error);
  const setGoal = useStudioStore((s) => s.setGoal);
  const setModelId = useStudioStore((s) => s.setModelId);

  const showGuidePref = useSettingsStore((s) => s.showGuide);
  const defaultGoal = useSettingsStore((s) => s.defaultGoal);
  const defaultModelId = useSettingsStore((s) => s.defaultModelId);
  const showCost = useFeatureEnabled("costComparison");
  const showBudget = useFeatureEnabled("contextBudget");

  // Seed the session from the user's saved defaults (once, on mount).
  useEffect(() => {
    setGoal(defaultGoal);
    setModelId(defaultModelId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const showGuide = status === "idle" && !result && showGuidePref;

  return (
    <TooltipProvider delayDuration={200} skipDelayDuration={300}>
      <ThemeController />
      <div className="flex min-h-full">
        <HistorySidebar />
        <div className="flex min-h-full min-w-0 flex-1 flex-col bg-grid">
          <Header />

          <main className="mx-auto w-full max-w-[1400px] space-y-5 px-4 py-6 sm:px-6">
            <InputPanel />
            <OptimizeBar />

            {showGuide ? <HowItWorks /> : null}

            {status === "error" && error ? <ErrorBox message={error} /> : null}

            {status === "running" && !result ? (
              <div className="mx-auto w-full max-w-2xl">
                <LiveProgress />
              </div>
            ) : null}

            {result ? (
              <div className="space-y-5">
                <div className="grid gap-5 xl:grid-cols-12">
                  <div className="xl:col-span-8">
                    <OutputPanel />
                  </div>
                  <div className="xl:col-span-4">
                    <LiveProgress />
                  </div>
                </div>

                <ReportCard />

                {showCost || showBudget ? (
                  <div
                    className={
                      showCost && showBudget ? "grid gap-5 lg:grid-cols-2" : "grid gap-5"
                    }
                  >
                    {showCost ? <CostVisualization /> : null}
                    {showBudget ? <ContextBudgetVisualization /> : null}
                  </div>
                ) : null}
              </div>
            ) : null}
          </main>

          <footer className="mx-auto w-full max-w-[1400px] px-4 pb-10 pt-4 text-center text-xs text-muted-foreground sm:px-6">
            miserly runs entirely in your browser · token counts use a real tokenizer · costs are
            estimates
          </footer>
        </div>
      </div>
    </TooltipProvider>
  );
}
