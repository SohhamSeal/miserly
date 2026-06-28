import * as React from "react";
import { ChevronDown, Info } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Tip } from "@/components/ui/tooltip";
import { useAnimationsEnabled } from "@/store/useSettingsStore";

interface CollapsibleCardProps {
  title: React.ReactNode;
  /** Optional leading icon shown before the title. */
  icon?: React.ReactNode;
  /** Optional info tooltip rendered next to the title. */
  hint?: React.ReactNode;
  /** Interactive controls pinned to the right of the header (always visible). */
  right?: React.ReactNode;
  /** Compact line shown next to the title only while collapsed. */
  summary?: React.ReactNode;
  defaultOpen?: boolean;
  /** Passed through to the inner CardContent (e.g. spacing utilities). */
  contentClassName?: string;
  className?: string;
  children: React.ReactNode;
}

/**
 * A Card whose body collapses behind its header. The chevron + title form one
 * large toggle target; the optional `hint` and `right` controls sit outside it
 * so they stay independently clickable. The body height animates open/closed,
 * and collapses instantly when the user has disabled animations.
 */
export function CollapsibleCard({
  title,
  icon,
  hint,
  right,
  summary,
  defaultOpen = true,
  contentClassName,
  className,
  children,
}: CollapsibleCardProps) {
  const animate = useAnimationsEnabled();
  const [open, setOpen] = React.useState(defaultOpen);
  const bodyId = React.useId();

  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <button
              type="button"
              onClick={() => setOpen((o) => !o)}
              aria-expanded={open}
              aria-controls={bodyId}
              className="group -ml-1 flex min-w-0 items-center gap-2 rounded-md px-1 py-0.5 text-left transition-colors hover:bg-secondary/60"
            >
              <ChevronDown
                className={cn(
                  "h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 group-hover:text-foreground",
                  !open && "-rotate-90",
                )}
              />
              {icon ? <span className="shrink-0 text-muted-foreground">{icon}</span> : null}
              <span className="truncate text-sm font-semibold tracking-tight">{title}</span>
            </button>
            {hint ? (
              <Tip content={hint}>
                <button
                  type="button"
                  className="shrink-0 text-muted-foreground/70 transition-colors hover:text-foreground"
                  aria-label="More information"
                >
                  <Info className="h-3.5 w-3.5" />
                </button>
              </Tip>
            ) : null}
            {!open && summary ? (
              <span className="ml-1 hidden truncate text-xs text-muted-foreground sm:inline">
                {summary}
              </span>
            ) : null}
          </div>
          {right ? <div className="shrink-0">{right}</div> : null}
        </div>
      </CardHeader>

      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            key="body"
            id={bodyId}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: animate ? 0.26 : 0, ease: "easeInOut" }}
            style={{ overflow: "hidden" }}
          >
            <CardContent className={contentClassName}>{children}</CardContent>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </Card>
  );
}
