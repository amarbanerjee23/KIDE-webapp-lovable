import { useEffect, useRef } from "react";
import Editor, { loader, type Monaco } from "@monaco-editor/react";
import * as monacoApi from "monaco-editor";
import type { editor } from "monaco-editor";
import {
  applyDiagnostics,
  MONACO_LANGUAGE_ID,
  registerKideLanguages,
  type SymbolTable,
} from "@/lib/dsl/monaco-languages";
import type { Diagnostic, DslKind } from "@/lib/dsl";

// Bundle Monaco locally so the editor works without any external network call.
(self as unknown as { MonacoEnvironment?: unknown }).MonacoEnvironment = {
  getWorker: () =>
    new Worker(new URL("./monaco.worker.ts", import.meta.url), { type: "module" }),
};
loader.config({ monaco: monacoApi });

export interface MonacoDslEditorProps {
  path: string;
  kind: DslKind;
  value: string;
  diagnostics: Diagnostic[];
  getSymbols: () => SymbolTable | null;
  onChange: (next: string) => void;
  onCursorLine?: (line: number) => void;
  height?: string;
  readOnly?: boolean;
}

export default function MonacoDslEditorImpl({
  path,
  kind,
  value,
  diagnostics,
  getSymbols,
  onChange,
  onCursorLine,
  height = "100%",
  readOnly = false,
}: MonacoDslEditorProps) {
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<Monaco | null>(null);

  useEffect(() => {
    const monaco = monacoRef.current;
    const model = editorRef.current?.getModel();
    if (monaco && model) applyDiagnostics(monaco, model, diagnostics);
  }, [diagnostics, value]);

  return (
    <Editor
      height={height}
      theme="kide-dark"
      path={path}
      language={MONACO_LANGUAGE_ID[kind]}
      value={value}
      beforeMount={(monaco) => {
        monacoRef.current = monaco;
        registerKideLanguages(monaco, getSymbols);
      }}
      onMount={(instance, monaco) => {
        editorRef.current = instance;
        monacoRef.current = monaco;
        const model = instance.getModel();
        if (model) applyDiagnostics(monaco, model, diagnostics);
        instance.onDidChangeCursorPosition((event) =>
          onCursorLine?.(event.position.lineNumber),
        );
      }}
      onChange={(next) => onChange(next ?? "")}
      options={{
        readOnly,
        fontSize: 13,
        fontFamily:
          "ui-monospace, SFMono-Regular, 'JetBrains Mono', Menlo, monospace",
        lineHeight: 20,
        minimap: { enabled: true, renderCharacters: false },
        scrollBeyondLastLine: false,
        smoothScrolling: true,
        renderLineHighlight: "all",
        cursorBlinking: "smooth",
        bracketPairColorization: { enabled: true },
        guides: { indentation: true, bracketPairs: true },
        wordBasedSuggestions: "currentDocument",
        quickSuggestions: { other: true, comments: false, strings: false },
        suggestOnTriggerCharacters: true,
        tabSize: 2,
        automaticLayout: true,
        padding: { top: 12, bottom: 12 },
        stickyScroll: { enabled: true },
        occurrencesHighlight: "singleFile",
        formatOnType: true,
      }}
    />
  );
}
