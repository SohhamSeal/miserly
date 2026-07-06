import { useState, type ReactNode } from "react";
import {
  AlertTriangle,
  Boxes,
  Check,
  Copy,
  Download,
  Info,
  Loader2,
  Monitor,
  Moon,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Sun,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { GOAL_LABELS, MODELS, type OptimizationGoal } from "@/engine";
import { FEATURE_META, isFeatureAvailable, type FeatureMeta } from "@/features";
import {
  featureEnabledFrom,
  useSettingsStore,
  type ThemeMode,
} from "@/store/useSettingsStore";
import { canInstallInApp, installFeatureInApp } from "@/lib/installClient";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tip } from "@/components/ui/tooltip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const GOALS: OptimizationGoal[] = [
  "balanced",
  "max_compression",
  "highest_quality",
  "lowest_cost",
  "fastest",
];

type SectionId = "general" | "tools" | "about";

const SECTIONS: { id: SectionId; label: string; icon: ReactNode }[] = [
  { id: "general", label: "General", icon: <SlidersHorizontal className="h-4 w-4" /> },
  { id: "tools", label: "Tools & Features", icon: <Boxes className="h-4 w-4" /> },
  { id: "about", label: "About", icon: <Info className="h-4 w-4" /> },
];

// ---------------------------------------------------------------------------
// Small building blocks
// ---------------------------------------------------------------------------

function PanelHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="mb-2">
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      <p className="text-sm text-muted-foreground">{subtitle}</p>
    </div>
  );
}

function SettingRow({
  title,
  description,
  htmlFor,
  control,
}: {
  title: string;
  description?: string;
  htmlFor?: string;
  control: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-6 border-b border-border/60 py-3.5 last:border-0">
      <div className="min-w-0">
        <label htmlFor={htmlFor} className="block text-sm font-medium">
          {title}
        </label>
        {description ? (
          <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
        ) : null}
      </div>
      <div className="shrink-0">{control}</div>
    </div>
  );
}

function ThemeSegmented() {
  const theme = useSettingsStore((s) => s.theme);
  const setTheme = useSettingsStore((s) => s.setTheme);
  const options: { value: ThemeMode; label: string; icon: ReactNode }[] = [
    { value: "system", label: "System", icon: <Monitor className="h-3.5 w-3.5" /> },
    { value: "light", label: "Light", icon: <Sun className="h-3.5 w-3.5" /> },
    { value: "dark", label: "Dark", icon: <Moon className="h-3.5 w-3.5" /> },
  ];
  return (
    <div className="inline-flex rounded-lg border border-border bg-secondary/40 p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => setTheme(o.value)}
          aria-pressed={theme === o.value}
          className={cn(
            "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
            theme === o.value
              ? "bg-card text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {o.icon}
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// General panel
// ---------------------------------------------------------------------------

function GeneralPanel() {
  const s = useSettingsStore();
  return (
    <div>
      <PanelHeader
        title="General"
        subtitle="Appearance and default behavior. These preferences are saved in your browser."
      />
      <SettingRow
        title="Theme"
        description="Match your system, or force light / dark."
        control={<ThemeSegmented />}
      />
      <SettingRow
        title="Reduce motion"
        description="Minimize animations across the app."
        control={
          <Switch checked={s.reduceMotion} onCheckedChange={s.setReduceMotion} />
        }
      />
      <SettingRow
        title="Auto-detect content type"
        description="Classify the input automatically on each run."
        control={<Switch checked={s.autoDetect} onCheckedChange={s.setAutoDetect} />}
      />
      <SettingRow
        title="Default optimization goal"
        description="Pre-selected goal for new sessions."
        control={
          <div className="w-[200px]">
            <Select
              value={s.defaultGoal}
              onValueChange={(v) => s.setDefaultGoal(v as OptimizationGoal)}
            >
              <SelectTrigger aria-label="Default optimization goal">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {GOALS.map((g) => (
                  <SelectItem key={g} value={g}>
                    {GOAL_LABELS[g]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        }
      />
      <SettingRow
        title="Default model"
        description="Pre-selected model for pricing estimates."
        control={
          <div className="w-[200px]">
            <Select value={s.defaultModelId} onValueChange={s.setDefaultModelId}>
              <SelectTrigger aria-label="Default model">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MODELS.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        }
      />
      <SettingRow
        title="Show “How it works” guide"
        description="Display the 3-step guide before your first optimization."
        control={<Switch checked={s.showGuide} onCheckedChange={s.setShowGuide} />}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tools & Features panel
// ---------------------------------------------------------------------------

function InstallCommand({ meta }: { meta: FeatureMeta }) {
  const [copied, setCopied] = useState(false);
  const command = "npm run setup";
  return (
    <div className="mt-3 rounded-md border border-border bg-secondary/40 p-3 text-xs">
      <p className="mb-2 text-muted-foreground">
        This feature needs <span className="font-mono">{meta.packages.join(", ")}</span>. Run the
        installer, enable it, then restart the dev server:
      </p>
      <div className="flex items-center gap-2">
        <code className="flex-1 rounded bg-background px-2 py-1.5 font-mono">{command}</code>
        <Button
          variant="outline"
          size="sm"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(command);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            } catch {
              /* clipboard blocked */
            }
          }}
        >
          {copied ? <Check className="text-success" /> : <Copy />}
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
    </div>
  );
}

function InstallButton({ meta }: { meta: FeatureMeta }) {
  const [installing, setInstalling] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showCommand, setShowCommand] = useState(false);

  if (!canInstallInApp) {
    return (
      <div>
        <Button variant="outline" size="sm" onClick={() => setShowCommand((v) => !v)}>
          <Download />
          How to enable
        </Button>
        {showCommand ? <InstallCommand meta={meta} /> : null}
      </div>
    );
  }

  async function onInstall() {
    setInstalling(true);
    setError(null);
    setLog([`Installing ${meta.packages.join(", ")}…`]);
    const result = await installFeatureInApp(meta.key, (line) =>
      setLog((prev) => [...prev, line]),
    );
    if (result.ok) {
      setLog((prev) => [...prev, "", "✓ Installed — reloading…"]);
      setTimeout(() => window.location.reload(), 1100);
    } else {
      setInstalling(false);
      setError(result.error ?? "Installation failed.");
    }
  }

  return (
    <div>
      <Tip content={`Installs ${meta.packages.join(", ")} on your machine, then reloads.`}>
        <Button variant="default" size="sm" onClick={onInstall} disabled={installing}>
          {installing ? <Loader2 className="animate-spin" /> : <Download />}
          {installing ? "Installing…" : "Install"}
        </Button>
      </Tip>

      {log.length > 0 ? (
        <pre className="mt-3 max-h-40 overflow-auto rounded-md border border-border bg-background p-2.5 text-[11px] leading-relaxed text-muted-foreground">
          {log.slice(-120).join("\n")}
        </pre>
      ) : null}

      {error ? (
        <div className="mt-2 flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-2.5 text-xs text-destructive">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <div>
            <div className="font-medium">Could not install automatically</div>
            <div className="text-destructive/80">{error}</div>
            <div className="mt-1 text-destructive/80">
              Install manually with <span className="font-mono">npm run setup</span>.
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function FeatureCard({ meta }: { meta: FeatureMeta }) {
  const available = isFeatureAvailable(meta.key);
  const enabled = useSettingsStore((s) => featureEnabledFrom(s, meta.key));
  const setFeatureEnabled = useSettingsStore((s) => s.setFeatureEnabled);

  return (
    <div className="rounded-lg border border-border bg-card/60 p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium">{meta.label}</span>
            {meta.heavy ? (
              <Tip content="Pulls a large npm package — off by default to keep installs lean.">
                <Badge variant="outline">{meta.sizeLabel ?? "heavy"}</Badge>
              </Tip>
            ) : null}
            {available ? (
              <Badge variant="secondary">installed</Badge>
            ) : (
              <Badge variant="outline" className="text-warning">
                not installed
              </Badge>
            )}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{meta.description}</p>
        </div>

        <div className="shrink-0 pt-0.5">
          {available ? (
            <Tip content={enabled ? "Enabled — click to turn off" : "Disabled — click to turn on"}>
              <span className="inline-flex">
                <Switch
                  checked={enabled}
                  onCheckedChange={(v) => setFeatureEnabled(meta.key, v)}
                />
              </span>
            </Tip>
          ) : (
            <Tip content="Toggle is locked until the package is installed.">
              <span className="inline-flex">
                <Switch checked={false} disabled />
              </span>
            </Tip>
          )}
        </div>
      </div>

      {!available ? <InstallButton meta={meta} /> : null}
    </div>
  );
}

function ToolsPanel() {
  return (
    <div>
      <PanelHeader
        title="Tools & Features"
        subtitle="Turn features on or off. Heavy ones must be installed first — installs are lean by default."
      />
      <div className="flex flex-col gap-3">
        {FEATURE_META.map((meta) => (
          <FeatureCard key={meta.key} meta={meta} />
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// About panel
// ---------------------------------------------------------------------------

function AboutRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-border/60 py-2.5 last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right">{value}</span>
    </div>
  );
}

function AboutPanel() {
  return (
    <div>
      <PanelHeader title="About miserly" subtitle="A frugal AI context optimization studio." />
      <div className="mb-4 flex items-start gap-2 rounded-md border border-border bg-secondary/30 p-3 text-sm">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-success" />
        <span className="text-muted-foreground">
          Everything runs locally in your browser. Your input is never uploaded anywhere.
        </span>
      </div>
      <div className="text-sm">
        <AboutRow label="Token counts" value="Exact tokenizer when installed, else a fast estimate" />
        <AboutRow label="Compression" value="Real structural reduction; algorithms simulated" />
        <AboutRow label="Pricing" value="Illustrative per-model estimates, editable in code" />
        <AboutRow label="License" value="MIT" />
        <AboutRow label="Version" value="0.1.0" />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Modal shell
// ---------------------------------------------------------------------------

export function SettingsModal() {
  const [section, setSection] = useState<SectionId>("general");

  return (
    <Dialog>
      <Tip content="Settings">
        <DialogTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label="Open settings">
            <Settings />
          </Button>
        </DialogTrigger>
      </Tip>
      <DialogContent
        showClose
        className="max-w-3xl gap-0 overflow-hidden p-0"
      >
        <DialogTitle className="sr-only">Settings</DialogTitle>
        <DialogDescription className="sr-only">
          Configure appearance, behavior and optional tools.
        </DialogDescription>
        <div className="flex max-h-[min(78vh,640px)]">
          <nav className="w-48 shrink-0 border-r border-border bg-secondary/30 p-3">
            <div className="px-2 pb-2 pt-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Settings
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
            {section === "general" ? <GeneralPanel /> : null}
            {section === "tools" ? <ToolsPanel /> : null}
            {section === "about" ? <AboutPanel /> : null}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
