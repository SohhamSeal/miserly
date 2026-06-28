import { useState } from "react";
import { ArrowRight, Check, Copy, Download, Maximize2 } from "lucide-react";
import { useStudioStore } from "@/store/useStudioStore";
import { formatNumber } from "@/lib/format";
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
  const [wrap, setWrap] = useState(false);

  if (!result) return null;

  const reduction =
    result.originalTokens > 0
      ? Math.round((1 - result.optimizedTokens / result.originalTokens) * 100)
      : 0;

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5">
        <SectionTitle hint="The compressed context, ready to paste into your LLM call. Read-only.">
          Optimized output
        </SectionTitle>
        <div className="flex items-center gap-3">
          <Tip content="Original tokens → optimized tokens for this run.">
            <div className="flex items-center gap-2 font-mono text-sm tabular-nums">
              <span className="text-muted-foreground line-through decoration-muted-foreground/40">
                {formatNumber(result.originalTokens)}
              </span>
              <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="font-semibold text-foreground">
                {formatNumber(result.optimizedTokens)}
              </span>
              <span className="rounded bg-success/15 px-1.5 py-0.5 text-xs text-success">
                −{reduction}%
              </span>
            </div>
          </Tip>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-y border-border bg-secondary/20 px-3 py-2">
        <CopyButton text={result.outputText} />
        <Tip content="Download as a .txt file">
          <Button
            variant="outline"
            size="sm"
            onClick={() => downloadText(result.outputText, "miserly-output.txt")}
          >
            <Download />
            Download
          </Button>
        </Tip>

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
                value={result.outputText}
                readOnly
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
          value={result.outputText}
          readOnly
          lineWrap={wrap}
          contentType={result.classification.primary}
        />
      </div>
    </div>
  );
}
