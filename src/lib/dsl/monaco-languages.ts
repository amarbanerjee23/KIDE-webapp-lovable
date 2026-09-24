/**
 * Monaco language services for the five KIDE languages.
 *
 * Everything here is derived from the same grammars and parsers the
 * validator uses, so highlighting, completion and hover never drift from
 * what the deterministic checker actually accepts.
 */
import type { Monaco } from "@monaco-editor/react";
import type { editor, languages, Position } from "monaco-editor";
import { DSL_KEYWORDS, DSL_LANGUAGES } from "./index";
import type { Diagnostic, DslKind, RefKind } from "./ast";
import {
  findDefinitions,
  findReferences,
  type WorkspaceLanguageIndex,
  type WorkspaceLanguageLocation,
} from "./workspace-language-service";

export const MONACO_LANGUAGE_ID: Record<DslKind, string> = {
  dml: "kide-dml",
  op: "kide-op",
  mncspec: "kide-mnc",
  cap: "kide-cap",
  activity: "kide-activity",
};

/** Names declared across the open workspace, by category. */
export type SymbolTable = Record<RefKind, Set<string>>;

/** Which reference categories each language can legitimately mention. */
const RELEVANT_SYMBOLS: Record<DslKind, RefKind[]> = {
  dml: ["dataModel"],
  op: ["dataModel", "parameter"],
  mncspec: [
    "dataModel",
    "operation",
    "interface",
    "command",
    "event",
    "alarm",
    "dataPoint",
    "response",
    "operatingState",
    "controlNode",
    "parameter",
  ],
  cap: [
    "interface",
    "command",
    "event",
    "alarm",
    "dataPoint",
    "response",
    "operation",
    "capability",
  ],
  activity: [
    "capability",
    "operation",
    "activity",
    "activityDiagram",
    "dataModel",
    "outcomeItem",
    "parameter",
    "command",
    "event",
  ],
};

const SYMBOL_LABEL: Record<RefKind, string> = {
  dataModel: "data model",
  parameter: "parameter",
  command: "command",
  event: "event",
  alarm: "alarm",
  dataPoint: "data point",
  response: "response",
  operation: "operation",
  capability: "capability",
  activity: "activity",
  activityDiagram: "activity diagram",
  interface: "component interface",
  controlNode: "control node",
  operatingState: "operating state",
  interfaceItem: "interface item",
  outcomeItem: "capability outcome",
};

/** Plain-language documentation shown on hover and beside completions. */
const KEYWORD_DOCS: Record<string, string> = {
  Package: "Names the package that groups the data models in this file.",
  DataModel: "A named data structure exchanged between devices and control logic.",
  primitives: "Simple typed fields, for example `int batteryPercent`.",
  composites: "Other data models embedded inside this one.",
  Operation: "A callable computation with typed inputs and a single typed result.",
  execute: "The implementation class or handler that performs the work.",
  return: "The single typed value the operation produces.",
  Model: "The root of an MNC design: interfaces plus the control nodes that use them.",
  InterfaceDescription:
    "Everything a device exposes: commands, events, alarms, data points, responses and operating states.",
  ControlNode: "Control logic bound to one interface; reacts to events and issues commands.",
  implements: "Binds this control node to the component interface it controls.",
  commands: "Instructions that can be sent to the device.",
  events: "Notifications the device emits when something happens.",
  alarms: "Notifications that signal an abnormal condition, carrying a severity level.",
  dataPoints: "Values the device publishes continuously or on request.",
  responses: "Replies a device returns after a command.",
  operatingStates: "The states the device can be in, with start and end states marked.",
  SubscribableItemList: "The events, alarms and data points this node listens to.",
  CommandResponseBlock: "What the node does when a command is issued and its response arrives.",
  EventBlock: "What the node does when an event is received.",
  AlarmBlock: "What the node does when an alarm is raised.",
  DataPointBlock: "What the node does when a data point value arrives.",
  Validate: "A check that must pass; `onFail` and `onSuccess` say what happens either way.",
  transition: "Moves the control node to another operating state.",
  Capability: "Something a device can do, bound to concrete interface items.",
  compatible: "The component interface this capability requires.",
  Init: "Subscriptions, commands and operations run when the capability starts.",
  providesControlCapabilities:
    "The commands, events, alarms and data points this capability exposes.",
  providesOutcomes: "The results a workflow can branch on after using this capability.",
  fireable: "Commands this capability can send.",
  receivable: "Events or responses this capability can receive.",
  raised: "Alarms this capability can raise.",
  subscribable: "Data points this capability keeps watching.",
  ActivityDiagram: "An ordered workflow of activities with conditions and failure paths.",
  activities: "The activities that make up this workflow.",
  Activity: "One step in the workflow; it uses exactly one capability, operation or sub-workflow.",
  requireCapability: "The capability that performs this step.",
  requireOperation: "The computation that performs this step.",
  childActivityDiagram: "Delegates this step to another workflow.",
  inputData: "Typed values this step needs before it can run.",
  conditions: "Branches taken depending on the outcome of this step.",
  nextActivity: "The step that runs next when this one completes.",
  interruptedBy: "Another activity that can interrupt this one.",
  interrupts: "The activity this one is allowed to interrupt.",
  time: "How long this step is expected to take.",
  final: "Ends the workflow and produces the named result.",
};

const SNIPPETS: Record<DslKind, { label: string; detail: string; body: string }[]> = {
  dml: [
    {
      label: "DataModel",
      detail: "New data model",
      body: "DataModel ${1:Name} {\n  primitives { ${2:int field} }\n}",
    },
    { label: "Package", detail: "Package header", body: "Package ${1:Name}\n" },
  ],
  op: [
    {
      label: "Operation",
      detail: "New operation",
      body: 'Operation ${1:Name}(${2:int input}) {\n  execute "${3:com.example.Handler}"\n  return ${4:float result}\n}',
    },
  ],
  mncspec: [
    {
      label: "InterfaceDescription",
      detail: "Device interface",
      body: "InterfaceDescription ${1:Device} {\n  commands { ${2:Start}[] }\n  events { Publish ${3:Ready}[] }\n}",
    },
    {
      label: "ControlNode",
      detail: "Control node",
      body: "ControlNode ${1:Controller} implements interface ${2:Device} {\n  EventBlock {\n    Event ${3:Ready} { }\n  }\n}",
    },
    {
      label: "Validate",
      detail: "Validation block",
      body: "Validate parameters {\n  ${1:param} Max Value ${2:100}\n} onFail { }",
    },
  ],
  cap: [
    {
      label: "Capability",
      detail: "New capability",
      body: "Capability ${1:Name} compatible component interface ${2:Device} {\n  providesControlCapabilities {\n    fireable commands : ${3:Start}\n    receivable events : ${4:Ready}\n  }\n}",
    },
  ],
  activity: [
    {
      label: "ActivityDiagram",
      detail: "New workflow",
      body: "ActivityDiagram ${1:Name} has activities {\n  Activity ${2:Step} {\n    requireCapability : ${3:Capability}\n  }\n}",
    },
    {
      label: "Activity",
      detail: "New activity",
      body: 'Activity ${1:Step} {\n  description : "${2:What this step does}"\n  requireCapability : ${3:Capability}\n  nextActivity : ${4:NextStep}\n}',
    },
    {
      label: "conditions",
      detail: "Outcome branch",
      body: "conditions {\n  from ${1:Step} if outcome is ${2:Outcome} => nextActivity : ${3:NextStep}\n}",
    },
  ],
};

function monarchFor(kind: DslKind): languages.IMonarchLanguage {
  return {
    defaultToken: "",
    ignoreCase: false,
    keywords: DSL_KEYWORDS[kind],
    tokenizer: {
      root: [
        [/\/\/.*$/, "comment"],
        [/\/\*/, "comment", "@comment"],
        [/"([^"\\]|\\.)*"/, "string"],
        [/'([^'\\]|\\.)*'/, "string"],
        [/\b\d+\.\d+\b/, "number.float"],
        [/\b\d+\b/, "number"],
        [/\^?[A-Za-z_][\w]*/, { cases: { "@keywords": "keyword", "@default": "identifier" } }],
        [/[{}()[\]]/, "@brackets"],
        [/[=><:,.;]+/, "delimiter"],
      ],
      comment: [
        [/[^/*]+/, "comment"],
        [/\*\//, "comment", "@pop"],
        [/[/*]/, "comment"],
      ],
    },
  };
}

let registered = false;
let currentSymbols: () => SymbolTable | null = () => null;
let currentLanguageIndex: () => WorkspaceLanguageIndex | null = () => null;

function modelMatchesPath(model: editor.ITextModel, path: string): boolean {
  const uri = decodeURIComponent(model.uri.toString());
  const uriPath = decodeURIComponent(model.uri.path).replace(/^\/+/, "");
  return (
    uri === path || uri.endsWith(`/${path}`) || uriPath === path || uriPath.endsWith(`/${path}`)
  );
}

function workspacePathForModel(
  model: editor.ITextModel,
  index: WorkspaceLanguageIndex,
): string | null {
  const paths = new Set([
    ...index.definitions.map((location) => location.path),
    ...index.references.map((location) => location.path),
  ]);
  for (const path of paths) {
    if (modelMatchesPath(model, path)) return path;
  }
  return null;
}

function locationRange(monaco: Monaco, location: WorkspaceLanguageLocation) {
  return new monaco.Range(
    location.line,
    location.column,
    location.line,
    location.column + Math.max(1, location.length),
  );
}

function locationUri(monaco: Monaco, path: string) {
  return (
    monaco.editor.getModels().find((model: editor.ITextModel) => modelMatchesPath(model, path))
      ?.uri ?? monaco.Uri.parse(path)
  );
}

/**
 * Registers all five languages, the workbench colour theme, and the
 * completion and hover providers. Safe to call more than once.
 */
export function registerKideLanguages(
  monaco: Monaco,
  getSymbols: () => SymbolTable | null,
  getLanguageIndex: () => WorkspaceLanguageIndex | null = () => null,
): void {
  currentSymbols = getSymbols;
  currentLanguageIndex = getLanguageIndex;

  if (registered) return;
  registered = true;

  for (const language of DSL_LANGUAGES) {
    const id = MONACO_LANGUAGE_ID[language.kind];
    const kind = language.kind;

    monaco.languages.register({ id, extensions: [language.extension], aliases: [language.label] });
    monaco.languages.setMonarchTokensProvider(id, monarchFor(kind));
    monaco.languages.setLanguageConfiguration(id, {
      comments: { lineComment: "//", blockComment: ["/*", "*/"] },
      brackets: [
        ["{", "}"],
        ["[", "]"],
        ["(", ")"],
      ],
      autoClosingPairs: [
        { open: "{", close: "}" },
        { open: "[", close: "]" },
        { open: "(", close: ")" },
        { open: '"', close: '"' },
      ],
      surroundingPairs: [
        { open: "{", close: "}" },
        { open: "[", close: "]" },
        { open: "(", close: ")" },
        { open: '"', close: '"' },
      ],
      indentationRules: {
        increaseIndentPattern: /\{[^}"']*$/,
        decreaseIndentPattern: /^\s*\}/,
      },
    });

    monaco.languages.registerCompletionItemProvider(id, {
      triggerCharacters: [":", " ", ",", "{"],
      provideCompletionItems: (model: editor.ITextModel, position: Position) => {
        const word = model.getWordUntilPosition(position);
        const range = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: word.startColumn,
          endColumn: word.endColumn,
        };
        const suggestions: languages.CompletionItem[] = [];

        for (const keyword of DSL_KEYWORDS[kind]) {
          suggestions.push({
            label: keyword,
            kind: monaco.languages.CompletionItemKind.Keyword,
            insertText: keyword,
            range,
            detail: "keyword",
            documentation: { value: KEYWORD_DOCS[keyword] ?? `KIDE ${kind} keyword.` },
            sortText: `2${keyword}`,
          });
        }

        const symbols = currentSymbols();
        if (symbols) {
          const seen = new Set<string>();
          for (const refKind of RELEVANT_SYMBOLS[kind]) {
            for (const name of symbols[refKind]) {
              if (seen.has(`${refKind}:${name}`)) continue;
              seen.add(`${refKind}:${name}`);
              suggestions.push({
                label: name,
                kind: monaco.languages.CompletionItemKind.Reference,
                insertText: name,
                range,
                detail: SYMBOL_LABEL[refKind],
                documentation: {
                  value: `Declared in this workspace as a ${SYMBOL_LABEL[refKind]}.`,
                },
                sortText: `1${name}`,
              });
            }
          }
        }

        for (const snippet of SNIPPETS[kind]) {
          suggestions.push({
            label: snippet.label,
            kind: monaco.languages.CompletionItemKind.Snippet,
            insertText: snippet.body,
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            range,
            detail: snippet.detail,
            sortText: `0${snippet.label}`,
          });
        }

        return { suggestions };
      },
    });

    monaco.languages.registerHoverProvider(id, {
      provideHover: (model: editor.ITextModel, position: Position) => {
        const word = model.getWordAtPosition(position);
        if (!word) return null;
        const range = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: word.startColumn,
          endColumn: word.endColumn,
        };

        const doc = KEYWORD_DOCS[word.word];
        if (doc) {
          return { range, contents: [{ value: `**${word.word}** — ${doc}` }] };
        }

        const symbols = currentSymbols();
        if (symbols) {
          for (const refKind of RELEVANT_SYMBOLS[kind]) {
            if (symbols[refKind].has(word.word)) {
              return {
                range,
                contents: [
                  { value: `**${word.word}**` },
                  { value: `Declared in this workspace as a ${SYMBOL_LABEL[refKind]}.` },
                ],
              };
            }
          }
        }
        return null;
      },
    });

    monaco.languages.registerDefinitionProvider(id, {
      provideDefinition: (model: editor.ITextModel, position: Position) => {
        const index = currentLanguageIndex();
        if (!index) return null;

        const path = workspacePathForModel(model, index);
        if (!path) return null;

        const definitions = findDefinitions(index, path, model.getOffsetAt(position));
        if (definitions.length === 0) return null;

        return definitions.map((location) => ({
          uri: locationUri(monaco, location.path),
          range: locationRange(monaco, location),
        }));
      },
    });

    monaco.languages.registerReferenceProvider(id, {
      provideReferences: (
        model: editor.ITextModel,
        position: Position,
        context: languages.ReferenceContext,
      ) => {
        const index = currentLanguageIndex();
        if (!index) return null;

        const path = workspacePathForModel(model, index);
        if (!path) return null;

        const references = findReferences(
          index,
          path,
          model.getOffsetAt(position),
          context.includeDeclaration,
        );
        if (references.length === 0) return null;

        return references.map((location) => ({
          uri: locationUri(monaco, location.path),
          range: locationRange(monaco, location),
        }));
      },
    });
  }

  monaco.editor.defineTheme("kide-dark", {
    base: "vs-dark",
    inherit: true,
    rules: [
      { token: "keyword", foreground: "8AB4F8", fontStyle: "bold" },
      { token: "identifier", foreground: "E6EAF2" },
      { token: "string", foreground: "7FD1A6" },
      { token: "number", foreground: "E6B168" },
      { token: "number.float", foreground: "E6B168" },
      { token: "comment", foreground: "6B7689", fontStyle: "italic" },
      { token: "delimiter", foreground: "9AA6BA" },
    ],
    colors: {
      "editor.background": "#0E1117",
      "editor.foreground": "#E6EAF2",
      "editorLineNumber.foreground": "#4C566B",
      "editorLineNumber.activeForeground": "#8AB4F8",
      "editor.lineHighlightBackground": "#161B24",
      "editorCursor.foreground": "#8AB4F8",
      "editorIndentGuide.background1": "#1D2430",
      "editorGutter.background": "#0E1117",
    },
  });
}

/** Publishes validator findings into the editor gutter and squiggles. */
export function applyDiagnostics(
  monaco: Monaco,
  model: editor.ITextModel,
  diagnostics: Diagnostic[],
): void {
  monaco.editor.setModelMarkers(
    model,
    "kide",
    diagnostics.map((diagnostic) => {
      const start = model.getPositionAt(diagnostic.offset);
      const end = model.getPositionAt(diagnostic.offset + Math.max(1, diagnostic.length));
      return {
        severity:
          diagnostic.severity === "error"
            ? monaco.MarkerSeverity.Error
            : diagnostic.severity === "warning"
              ? monaco.MarkerSeverity.Warning
              : monaco.MarkerSeverity.Info,
        message: diagnostic.message,
        code: diagnostic.code,
        source: "KIDE validator",
        startLineNumber: start.lineNumber,
        startColumn: start.column,
        endLineNumber: end.lineNumber,
        endColumn: end.column,
      };
    }),
  );
}
