import { useMemo } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { createTheme } from "@uiw/codemirror-themes";
import { tags as t } from "@lezer/highlight";
import { EditorView } from "@codemirror/view";
import type { Extension } from "@codemirror/state";
import { json } from "@codemirror/lang-json";
import { javascript } from "@codemirror/lang-javascript";
import { markdown } from "@codemirror/lang-markdown";
import type { ContentType } from "@/engine";
import { useResolvedTheme } from "@/store/useSettingsStore";

const FONT = '"JetBrains Mono", ui-monospace, SFMono-Regular, monospace';

const miserlyDarkTheme = createTheme({
  theme: "dark",
  settings: {
    background: "transparent",
    foreground: "#e4e4e7",
    caret: "#818cf8",
    selection: "#4f46e533",
    selectionMatch: "#4f46e533",
    lineHighlight: "#ffffff08",
    gutterBackground: "transparent",
    gutterForeground: "#52525b",
    gutterBorder: "transparent",
    fontFamily: FONT,
  },
  styles: [
    { tag: t.comment, color: "#6b7280", fontStyle: "italic" },
    { tag: [t.string, t.special(t.string)], color: "#86efac" },
    { tag: [t.number, t.bool, t.null], color: "#fbbf24" },
    { tag: [t.keyword, t.operatorKeyword], color: "#c4b5fd" },
    { tag: [t.propertyName], color: "#93c5fd" },
    { tag: [t.function(t.variableName), t.labelName], color: "#a5b4fc" },
    { tag: [t.typeName, t.className], color: "#67e8f9" },
    { tag: [t.tagName], color: "#f9a8d4" },
    { tag: [t.attributeName], color: "#fcd34d" },
    { tag: [t.heading], color: "#a5b4fc", fontWeight: "bold" },
    { tag: [t.link, t.url], color: "#7dd3fc", textDecoration: "underline" },
    { tag: [t.invalid], color: "#fca5a5" },
  ],
});

const miserlyLightTheme = createTheme({
  theme: "light",
  settings: {
    background: "transparent",
    foreground: "#27272a",
    caret: "#4f46e5",
    selection: "#4f46e520",
    selectionMatch: "#4f46e520",
    lineHighlight: "#0000000a",
    gutterBackground: "transparent",
    gutterForeground: "#a1a1aa",
    gutterBorder: "transparent",
    fontFamily: FONT,
  },
  styles: [
    { tag: t.comment, color: "#6b7280", fontStyle: "italic" },
    { tag: [t.string, t.special(t.string)], color: "#15803d" },
    { tag: [t.number, t.bool, t.null], color: "#b45309" },
    { tag: [t.keyword, t.operatorKeyword], color: "#7c3aed" },
    { tag: [t.propertyName], color: "#1d4ed8" },
    { tag: [t.function(t.variableName), t.labelName], color: "#4f46e5" },
    { tag: [t.typeName, t.className], color: "#0e7490" },
    { tag: [t.tagName], color: "#be185d" },
    { tag: [t.attributeName], color: "#a16207" },
    { tag: [t.heading], color: "#4f46e5", fontWeight: "bold" },
    { tag: [t.link, t.url], color: "#0369a1", textDecoration: "underline" },
    { tag: [t.invalid], color: "#dc2626" },
  ],
});

const LANG_BY_TYPE: Partial<Record<ContentType, () => Extension[]>> = {
  json: () => [json()],
  code: () => [javascript({ jsx: true, typescript: true })],
  markdown: () => [markdown()],
  knowledge: () => [markdown()],
  rag: () => [markdown()],
};

function languageExtension(contentType?: ContentType): Extension[] {
  if (!contentType) return [];
  return LANG_BY_TYPE[contentType]?.() ?? [];
}

// When a FILE is dropped onto the editor, CodeMirror's built-in drop handler
// would insert the file's text at the cursor — but the InputPanel wrapper also
// ingests the same file via `ingestFile`, so the content ends up duplicated.
// This handler runs on CodeMirror's own (native) drop listener, which fires
// before the event bubbles to the React wrapper. Returning `true` for a file
// drop cancels CM's default insert (and calls preventDefault) but does NOT stop
// propagation, so the wrapper still runs `ingestFile` exactly once. Normal text
// drags within the editor return `false` and behave as usual.
const suppressFileDrop = EditorView.domEventHandlers({
  drop: (event) => {
    if (event.dataTransfer && event.dataTransfer.files.length > 0) {
      event.preventDefault();
      return true;
    }
    return false;
  },
});

export interface CodeEditorProps {
  value: string;
  onChange?: (value: string) => void;
  readOnly?: boolean;
  contentType?: ContentType;
  lineWrap?: boolean;
  lineNumbers?: boolean;
  placeholder?: string;
}

export function CodeEditor({
  value,
  onChange,
  readOnly = false,
  contentType,
  lineWrap = false,
  lineNumbers = true,
  placeholder,
}: CodeEditorProps) {
  const resolvedTheme = useResolvedTheme();
  const extensions = useMemo(() => {
    const ext = [...languageExtension(contentType), suppressFileDrop];
    return lineWrap ? [...ext, EditorView.lineWrapping] : ext;
  }, [contentType, lineWrap]);

  return (
    <CodeMirror
      value={value}
      onChange={onChange ? (val) => onChange(val) : undefined}
      theme={resolvedTheme === "light" ? miserlyLightTheme : miserlyDarkTheme}
      readOnly={readOnly}
      editable={!readOnly}
      placeholder={placeholder}
      extensions={extensions}
      height="100%"
      style={{ height: "100%", fontSize: 13 }}
      basicSetup={{
        lineNumbers,
        foldGutter: false,
        highlightActiveLine: !readOnly,
        highlightActiveLineGutter: !readOnly,
        autocompletion: false,
        searchKeymap: false,
        bracketMatching: true,
        closeBrackets: !readOnly,
      }}
    />
  );
}
