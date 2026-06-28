import { useFeatureEnabled } from "@/store/useSettingsStore";
import { CodeEditor, type CodeEditorProps } from "./CodeEditor";
import { PlainEditor } from "./PlainEditor";

/**
 * Renders the rich CodeMirror editor when the `richEditor` feature is enabled,
 * otherwise a plain textarea. Same props either way so call sites don't care.
 */
export function Editor(props: CodeEditorProps) {
  const rich = useFeatureEnabled("richEditor");
  if (rich) return <CodeEditor {...props} />;
  return (
    <PlainEditor
      value={props.value}
      onChange={props.onChange}
      readOnly={props.readOnly}
      placeholder={props.placeholder}
      lineWrap={props.lineWrap}
    />
  );
}
