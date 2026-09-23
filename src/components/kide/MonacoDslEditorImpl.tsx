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
import type { Diagnostic, DslKind, WorkspaceFile } from "@/lib/dsl";
import type { WorkspaceLanguageIndex } from "@/lib/dsl/workspace-language-service";

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
  getLanguageIndex?: () => WorkspaceLanguageIndex | null;
  workspaceFiles?: WorkspaceFile[];
  onChange: (next: string) => void;
  onOpenPath?: (path: string) => void;
  onCursorLine?: (line: number) => void;
  height?: string;
  readOnly?: boolean;
}

function modelMatchesPath(model: editor.ITextModel, path: string): boolean {
  const uri = decodeURIComponent(model.uri.toString());
  const uriPath = decodeURIComponent(model.uri.path).replace(/^\/+/, "");
  return uri === path || uri.endsWith(`/${path}`) || uriPath === path || uriPath.endsWith(`/${path}`);
}

function syncWorkspaceModels(
  monaco: Monaco,
  files: WorkspaceFile[],
  activeModel: editor.ITextModel | null,
  createdModels: editor.ITextModel[],
) {
  for (const file of files) {
    const existing = monaco.editor
      .getModels()
      .find((model) => modelMatchesPath(model, file.path));

    if (!existing) {
      const model = monaco.editor.createModel(
        file.source,
        MONACO_LANGUAGE_ID[file.kind],
        monaco.Uri.parse(file.path),
      );
      createdModels.push(model);
      continue;
    }

    if (existing !== activeModel && existing.getValue() !== file.source) {
      existing.setValue(file.source);
    }
  }
}

export default function MonacoDslEditorImpl({
  path,
  kind,
  value,
  diagnostics,
  getSymbols,
  getLanguageIndex = () => null,
  workspaceFiles = [],
  onChange,
  onOpenPath,
  onCursorLine,
  height = "100%",
  readOnly = false,
}: MonacoDslEditorProps) {
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<Monaco | null>(null);
  const createdModelsRef = useRef<editor.ITextModel[]>([]);
  const workspaceFilesRef = useRef(workspaceFiles);
  const onOpenPathRef = useRef(onOpenPath);

  workspaceFilesRef.current = workspaceFiles;
  onOpenPathRef.current = onOpenPath;

  useEffect(() => {
    const monaco = monacoRef.current;
    if (monaco) {
      registerKideLanguages(monaco, getSymbols, getLanguageIndex);
    }
  }, [getLanguageIndex, getSymbols]);

  useEffect(() => {
    const monaco = monacoRef.current;
    if (!monaco) return;

    syncWorkspaceModels(
      monaco,
      workspaceFiles,
      editorRef.current?.getModel() ?? null,
      createdModelsRef.current,
    );
  }, [workspaceFiles]);

  useEffect(() => {
    const monaco = monacoRef.current;
    const model = editorRef.current?.getModel();
    if (monaco && model) applyDiagnostics(monaco, model, diagnostics);
  }, [diagnostics, value]);

  useEffect(
    () => () => {
      for (const model of createdModelsRef.current) {
        if (!model.isDisposed()) model.dispose();
      }
      createdModelsRef.current = [];
    },
    [],
  );

  return (
    <Editor
      height={height}
      theme="kide-dark"
      path={path}
      language={MONACO_LANGUAGE_ID[kind]}
      value={value}
      beforeMount={(monaco) => {
        monacoRef.current = monaco;
        registerKideLanguages(monaco, getSymbols, getLanguageIndex);
      }}
      onMount={(instance, monaco) => {
        editorRef.current = instance;
        monacoRef.current = monaco;
        registerKideLanguages(monaco, getSymbols, getLanguageIndex);
        syncWorkspaceModels(
          monaco,
          workspaceFilesRef.current,
          instance.getModel(),
          createdModelsRef.current,
        );

        const model = instance.getModel();
        if (model) applyDiagnostics(monaco, model, diagnostics);

        instance.onDidChangeCursorPosition((event) =>
          onCursorLine?.(event.position.lineNumber),
        );
        instance.onDidChangeModel(() => {
          const nextModel = instance.getModel();
          if (!nextModel) return;

          const target = workspaceFilesRef.current.find((file) =>
            modelMatchesPath(nextModel, file.path),
          );
          if (target) onOpenPathRef.current?.(target.path);
        });
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
