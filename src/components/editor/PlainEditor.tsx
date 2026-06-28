import { cn } from "@/lib/utils";

export interface PlainEditorProps {
  value: string;
  onChange?: (value: string) => void;
  readOnly?: boolean;
  placeholder?: string;
  lineWrap?: boolean;
}

/**
 * Lightweight textarea editor used when the rich CodeMirror editor feature is
 * turned off. No syntax highlighting, but zero overhead.
 */
export function PlainEditor({
  value,
  onChange,
  readOnly = false,
  placeholder,
  lineWrap = false,
}: PlainEditorProps) {
  return (
    <textarea
      value={value}
      onChange={onChange ? (e) => onChange(e.target.value) : undefined}
      readOnly={readOnly}
      placeholder={placeholder}
      spellCheck={false}
      className={cn(
        "h-full w-full resize-none border-0 bg-transparent px-4 py-3 font-mono text-[13px] leading-relaxed text-foreground outline-none placeholder:text-muted-foreground",
        lineWrap ? "whitespace-pre-wrap break-words" : "overflow-auto whitespace-pre",
      )}
    />
  );
}
