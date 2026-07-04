import { useDeferredValue, useMemo, useRef, useState } from "react";
import { ClipboardPaste, FileUp, FlaskConical, Trash2, Upload } from "lucide-react";
import { useStudioStore } from "@/store/useStudioStore";
import { useFeatureEnabled } from "@/store/useSettingsStore";
import { countTokens } from "@/engine";
import {
  documentParsingAvailable,
  FeatureNotInstalledError,
  parseBinaryDocument,
} from "@/integrations";
import { SAMPLES } from "@/data/samples";
import { formatNumber } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Tip } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Editor } from "@/components/editor/Editor";
import { SectionTitle } from "@/components/common";

const TEXT_EXTENSIONS = [
  "txt", "md", "json", "csv", "log", "yaml", "yml", "xml",
  "sql", "ts", "tsx", "js", "jsx", "py", "go", "rs", "java", "rb",
];
const BINARY_DOC_EXTENSIONS = ["pdf", "docx", "doc"];

function fileExt(name: string): string {
  return name.split(".").pop()?.toLowerCase() ?? "";
}

function isTextFile(name: string): boolean {
  return TEXT_EXTENSIONS.includes(fileExt(name));
}

function Count({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <Tip content={hint}>
      <div className="flex cursor-default items-baseline gap-1 rounded-md px-1.5 py-0.5 hover:bg-secondary/60">
        <span className="font-mono text-xs font-semibold tabular-nums">{value}</span>
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</span>
      </div>
    </Tip>
  );
}

export function InputPanel() {
  const input = useStudioStore((s) => s.input);
  const setInput = useStudioStore((s) => s.setInput);
  const loadSample = useStudioStore((s) => s.loadSample);
  const clearInput = useStudioStore((s) => s.clearInput);

  const showSamples = useFeatureEnabled("sampleDocuments");
  const docParsingEnabled = useFeatureEnabled("documentParsing");
  const accurate = useFeatureEnabled("accurateTokenizer");

  const [isDragging, setIsDragging] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const deferredInput = useDeferredValue(input);
  // `accurate` is a dependency so the live count recomputes when the user
  // toggles the accurate tokenizer in Settings.
  const tokens = useMemo(() => countTokens(deferredInput), [deferredInput, accurate]);
  const chars = input.length;
  const words = useMemo(() => (input.match(/\S+/g) ?? []).length, [input]);
  const lines = useMemo(() => (input === "" ? 0 : input.split("\n").length), [input]);

  async function ingestFile(file: File) {
    setNotice(null);
    const ext = fileExt(file.name);

    if (BINARY_DOC_EXTENSIONS.includes(ext)) {
      if (!docParsingEnabled || !documentParsingAvailable) {
        setNotice(
          `Enable “Document parsing” in Settings to read ${ext.toUpperCase()} files (or paste the text).`,
        );
        return;
      }
      try {
        const text = await parseBinaryDocument(file);
        setInput(text);
      } catch (err) {
        setNotice(
          err instanceof FeatureNotInstalledError
            ? "Document parsing isn't installed yet — enable it in Settings."
            : `Could not parse "${file.name}".`,
        );
      }
      return;
    }

    if (!isTextFile(file.name)) {
      setNotice(`"${file.name}" doesn't look like a text file — paste the content instead.`);
      return;
    }
    try {
      const text = await file.text();
      setInput(text);
    } catch {
      setNotice(`Could not read "${file.name}".`);
    }
  }

  async function handlePaste() {
    setNotice(null);
    try {
      const text = await navigator.clipboard.readText();
      if (text) setInput(text);
      else setNotice("Clipboard is empty.");
    } catch {
      setNotice("Clipboard access was blocked — paste directly into the editor instead.");
    }
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-card">
      <div className="flex items-center justify-between gap-3 px-4 py-2.5">
        <SectionTitle hint="Paste anything: logs, code, JSON, Markdown, chat history. miserly detects the type automatically.">
          Input
        </SectionTitle>
        <div className="flex items-center gap-1">
          <Count label="chars" value={formatNumber(chars)} hint="Total characters in the input." />
          <Count label="words" value={formatNumber(words)} hint="Whitespace-separated words." />
          <Count label="lines" value={formatNumber(lines)} hint="Number of lines." />
          <Count
            label="tokens"
            value={(accurate ? "" : "~") + formatNumber(tokens)}
            hint={
              accurate
                ? "Live token count using the exact OpenAI tokenizer — what an LLM is billed on."
                : "Live token estimate (~4 chars/token). Enable the accurate tokenizer in Settings for exact counts."
            }
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 border-y border-border bg-secondary/20 px-3 py-2">
        <Tip content="Paste from your clipboard">
          <Button variant="outline" size="sm" onClick={handlePaste}>
            <ClipboardPaste />
            Paste
          </Button>
        </Tip>
        <Tip
          content={
            docParsingEnabled && documentParsingAvailable
              ? "Upload a text file, PDF or DOCX"
              : "Upload a text file (.txt, .md, .json, .csv, .log, source code)"
          }
        >
          <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
            <FileUp />
            Upload
          </Button>
        </Tip>

        {showSamples ? (
          <DropdownMenu>
            <Tip content="Load a realistic example to try it out">
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  <FlaskConical />
                  Load sample
                </Button>
              </DropdownMenuTrigger>
            </Tip>
            <DropdownMenuContent align="start" className="w-80">
              <DropdownMenuLabel>Sample documents</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {SAMPLES.map((sample) => (
                <DropdownMenuItem
                  key={sample.id}
                  onSelect={() => loadSample(sample.id)}
                  className="flex-col items-start"
                >
                  <span className="font-medium">{sample.name}</span>
                  <span className="text-xs text-muted-foreground">{sample.description}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}

        <div className="ml-auto">
          <Tip content="Clear the input">
            <Button
              variant="ghost"
              size="sm"
              onClick={clearInput}
              disabled={input === ""}
              className="text-muted-foreground"
            >
              <Trash2 />
              Clear
            </Button>
          </Tip>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept=".txt,.md,.json,.csv,.log,.yaml,.yml,.xml,.sql,.ts,.tsx,.js,.jsx,.py,.go,.rs,.java,.rb,.pdf,.docx"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void ingestFile(file);
            e.target.value = "";
          }}
        />
      </div>

      <div
        className="relative h-[42vh] min-h-[320px]"
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          const file = e.dataTransfer.files?.[0];
          if (file) void ingestFile(file);
        }}
      >
        <Editor
          value={input}
          onChange={setInput}
          placeholder="Paste your context here, drop a file, or load a sample…"
        />
        {isDragging ? (
          <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center border-2 border-dashed border-primary/60 bg-primary/10 backdrop-blur-sm">
            <div className="flex flex-col items-center gap-2 text-primary">
              <Upload className="h-6 w-6" />
              <span className="text-sm font-medium">Drop to load file</span>
            </div>
          </div>
        ) : null}
      </div>

      {notice ? (
        <div className="border-t border-border bg-warning/10 px-4 py-2 text-xs text-warning">
          {notice}
        </div>
      ) : null}
    </div>
  );
}
