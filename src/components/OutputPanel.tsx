import { useMemo, useState } from "react";
import { ArrowRight, Check, Copy, Download, Maximize2, RotateCcw } from "lucide-react";
import { countTokens } from "@/engine";
import { useStudioStore } from "@/store/useStudioStore";
import { useFeatureEnabled } from "@/store/useSettingsStore";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Tip } from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Editor } from "@/components/editor/Editor";
import { SectionTitle } from "@/components/common";

function downloadText(text: string, filename: string) {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Tip content={copied ? "Copied!" : "Copy optimized output"}>
      <Button
        variant="outline"
        size="sm"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(text);
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
    </Tip>
  );
}

export function OutputPanel() {
  const result = useStudioStore((s) => s.result);
  // Edits live in the store (not local state) so the report / cost / budget
  // cards recompute from the same edited text. The store resets it to `null`
  // on every new run / sample / history restore, so no local effect is needed.
  const edited = useStudioStore((s) => s.editedOutput);
  const setEdited = useStudioStore((s) => s.setEditedOutput);
  const accurate = useFeatureEnabled("accurateTokenizer");
  const [wrap, setWrap] = useState(false);

  const outText = edited ?? result?.outputText ?? "";
  const isEdited = edited !== null && edited !== result?.outputText;

  // Token count + reduction track the edited text so the numbers stay honest.
  const optimizedTokens = useMemo(
    () => (edited === null ? result?.optimizedTokens ?? 0 : countTokens(edited)),
    // `accurate` is a dep so an edited count recomputes when the tokenizer toggles.
    [edited, result?.optimizedTokens, accurate],
  );

  if (!result) return null;

  const reduction =
    result.originalTokens > 0
      ? Math.round((1 - optimizedTokens / result.originalTokens) * 100)
      : 0;
  // Negative reduction = the edited output is LARGER than the input. Render it
  // as a red "+N%" instead of the nonsensical green "−-N%".
  const grew = reduction < 0;

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5">
        <SectionTitle hint="The compressed context, ready to paste into your LLM call. Editable — tweak it before you copy.">
          Optimized output
        </SectionTitle>
        <div className="flex items-center gap-3">
          <Tip
            content={
              accurate
                ? "Original tokens → optimized tokens. Updates live as you edit."
                : "Original → optimized tokens (estimated ~4 chars/token). Updates live as you edit."
            }
          >
            <div className="flex items-center gap-2 font-mono text-sm tabular-nums">
              <span className="text-muted-foreground line-through decoration-muted-foreground/40">
                {(accurate ? "" : "~") + formatNumber(result.originalTokens)}
              </span>
              <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="font-semibold text-foreground">
                {(accurate ? "" : "~") + formatNumber(optimizedTokens)}
              </span>
              <span
                className={cn(
                  "rounded px-1.5 py-0.5 text-xs",
                  grew ? "bg-destructive/15 text-destructive" : "bg-success/15 text-success",
                )}
              >
                {grew ? "+" : "−"}
                {Math.abs(reduction)}%
              </span>
            </div>
          </Tip>
          {isEdited ? (
            <Tip content="You've edited the output — the counts above reflect your changes.">
              <span className="rounded-full border border-warning/30 bg-warning/10 px-2 py-0.5 text-[11px] font-medium text-warning">
                edited
              </span>
            </Tip>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-y border-border bg-secondary/20 px-3 py-2">
        <CopyButton text={outText} />
        <Tip content="Download as a .txt file">
          <Button
            variant="outline"
            size="sm"
            onClick={() => downloadText(outText, "miserly-output.txt")}
          >
            <Download />
            Download
          </Button>
        </Tip>

        {isEdited ? (
          <Tip content="Discard your edits and restore the engine's optimized output.">
            <Button variant="ghost" size="sm" onClick={() => setEdited(null)}>
              <RotateCcw />
              Revert
            </Button>
          </Tip>
        ) : null}

        <Dialog>
          <Tip content="Open in fullscreen">
            <DialogTrigger asChild>
              <Button variant="outline" size="sm">
                <Maximize2 />
                Fullscreen
              </Button>
            </DialogTrigger>
          </Tip>
          <DialogContent className="h-[85vh] max-w-[90vw] p-0">
            <DialogHeader className="border-b border-border px-4 py-3">
              <DialogTitle>Optimized output</DialogTitle>
            </DialogHeader>
            <div className="h-full overflow-hidden px-1 pb-4">
              <Editor
                value={outText}
                onChange={setEdited}
                lineWrap={wrap}
                contentType={result.classification.primary}
              />
            </div>
          </DialogContent>
        </Dialog>

        <div className="ml-auto flex items-center gap-2">
          <Tip content="Wrap long lines instead of scrolling horizontally.">
            <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
              <Switch checked={wrap} onCheckedChange={setWrap} />
              Word wrap
            </label>
          </Tip>
        </div>
      </div>

      <div className="h-[42vh] min-h-[320px]">
        <Editor
          value={outText}
          onChange={setEdited}
          lineWrap={wrap}
          contentType={result.classification.primary}
        />
      </div>
    </div>
  );
}
