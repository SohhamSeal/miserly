/**
 * Accent color system.
 *
 * Tailwind only keeps classes it can find as literal strings, so we cannot do
 * `bg-${family}-500`. Instead each accent family maps to a fixed set of literal
 * class strings here — this keeps every color available and lets plugins /
 * content types declare an accent by name.
 *
 * `text` carries BOTH a light- and dark-theme value. The chips render colored
 * text on a 15% tint of the same hue; a `-300` shade is only legible on the
 * dark tint, so light theme uses the much darker `-700` shade to clear WCAG AA.
 */
export interface AccentClasses {
  bar: string;
  text: string;
  soft: string;
  dot: string;
  ring: string;
  border: string;
}

const ACCENTS: Record<string, AccentClasses> = {
  primary: {
    bar: "bg-primary",
    text: "text-primary",
    soft: "bg-primary/15",
    dot: "bg-primary",
    ring: "ring-primary/30",
    border: "border-primary/40",
  },
  indigo: {
    bar: "bg-indigo-500",
    text: "text-indigo-700 dark:text-indigo-300",
    soft: "bg-indigo-500/15",
    dot: "bg-indigo-400",
    ring: "ring-indigo-500/30",
    border: "border-indigo-500/40",
  },
  sky: {
    bar: "bg-sky-500",
    text: "text-sky-700 dark:text-sky-300",
    soft: "bg-sky-500/15",
    dot: "bg-sky-400",
    ring: "ring-sky-500/30",
    border: "border-sky-500/40",
  },
  amber: {
    bar: "bg-amber-500",
    text: "text-amber-700 dark:text-amber-300",
    soft: "bg-amber-500/15",
    dot: "bg-amber-400",
    ring: "ring-amber-500/30",
    border: "border-amber-500/40",
  },
  rose: {
    bar: "bg-rose-500",
    text: "text-rose-700 dark:text-rose-300",
    soft: "bg-rose-500/15",
    dot: "bg-rose-400",
    ring: "ring-rose-500/30",
    border: "border-rose-500/40",
  },
  emerald: {
    bar: "bg-emerald-500",
    text: "text-emerald-700 dark:text-emerald-300",
    soft: "bg-emerald-500/15",
    dot: "bg-emerald-400",
    ring: "ring-emerald-500/30",
    border: "border-emerald-500/40",
  },
  violet: {
    bar: "bg-violet-500",
    text: "text-violet-700 dark:text-violet-300",
    soft: "bg-violet-500/15",
    dot: "bg-violet-400",
    ring: "ring-violet-500/30",
    border: "border-violet-500/40",
  },
  fuchsia: {
    bar: "bg-fuchsia-500",
    text: "text-fuchsia-700 dark:text-fuchsia-300",
    soft: "bg-fuchsia-500/15",
    dot: "bg-fuchsia-400",
    ring: "ring-fuchsia-500/30",
    border: "border-fuchsia-500/40",
  },
  cyan: {
    bar: "bg-cyan-500",
    text: "text-cyan-700 dark:text-cyan-300",
    soft: "bg-cyan-500/15",
    dot: "bg-cyan-400",
    ring: "ring-cyan-500/30",
    border: "border-cyan-500/40",
  },
  teal: {
    bar: "bg-teal-500",
    text: "text-teal-700 dark:text-teal-300",
    soft: "bg-teal-500/15",
    dot: "bg-teal-400",
    ring: "ring-teal-500/30",
    border: "border-teal-500/40",
  },
  purple: {
    bar: "bg-purple-500",
    text: "text-purple-700 dark:text-purple-300",
    soft: "bg-purple-500/15",
    dot: "bg-purple-400",
    ring: "ring-purple-500/30",
    border: "border-purple-500/40",
  },
  slate: {
    bar: "bg-slate-500",
    text: "text-slate-700 dark:text-slate-300",
    soft: "bg-slate-500/15",
    dot: "bg-slate-400",
    ring: "ring-slate-500/30",
    border: "border-slate-500/40",
  },
};

export function accent(family: string): AccentClasses {
  return ACCENTS[family] ?? ACCENTS.slate;
}
