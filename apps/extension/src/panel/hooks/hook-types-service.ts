import ts from "typescript";

// Servicio de lenguaje de los hooks (006, research R4): TypeScript con `lib.es2022` (sin DOM, así
// que `fetch`, `window` y `document` ya son errores de tipo) y la API de `hook-context.d.ts`.
// Puro: el Worker del panel lo envuelve y las pruebas lo usan en Node.

export const HOOK_FILE = "/hook.ts";
const TYPES_FILE = "/nahual-hooks.d.ts";

export interface HookDiagnostic {
  from: number;
  to: number;
  /** 1-based. */
  line: number;
  message: string;
  severity: "error" | "warning";
}

export interface HookCompletion {
  label: string;
  kind: string;
  detail?: string;
}

const OPTIONS: ts.CompilerOptions = {
  lib: ["lib.es2022.d.ts"],
  types: [],
  strict: true,
  noEmit: true,
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  allowNonTsExtensions: true,
};

/** Construcciones que un hook no admite (research R3): se marcan como error propio. */
function unsupported(file: ts.SourceFile): HookDiagnostic[] {
  const found: HookDiagnostic[] = [];
  const add = (node: ts.Node, message: string) => {
    const from = node.getStart(file);
    found.push({
      from,
      to: node.getEnd(),
      line: file.getLineAndCharacterOfPosition(from).line + 1,
      message,
      severity: "error",
    });
  };
  const visit = (node: ts.Node) => {
    if (ts.isEnumDeclaration(node)) add(node.name, "hook_error_enum");
    else if (ts.isDecorator(node)) add(node, "hook_error_decorator");
    else if (ts.isImportDeclaration(node)) {
      const typeOnly = node.importClause?.isTypeOnly ?? false;
      const from = ts.isStringLiteral(node.moduleSpecifier) ? node.moduleSpecifier.text : "";
      if (!(typeOnly && from === "./nahual-hooks")) add(node, "hook_error_import");
    } else if (ts.isImportEqualsDeclaration(node)) add(node, "hook_error_import");
    else if (
      ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) && node.expression.text === "require"))
    )
      add(node, "hook_error_import");
    else if (ts.isExportDeclaration(node) && !node.isTypeOnly) add(node, "hook_error_export");
    else if (
      ts.canHaveModifiers(node) &&
      ts.getModifiers(node)?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) &&
      !ts.getModifiers(node)?.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword) &&
      !ts.isInterfaceDeclaration(node) &&
      !ts.isTypeAliasDeclaration(node)
    )
      add(node, "hook_error_export");
    ts.forEachChild(node, visit);
  };
  visit(file);
  const hasDefault =
    file.statements.some(ts.isExportAssignment) ||
    file.statements.some(
      (s) =>
        ts.canHaveModifiers(s) &&
        ts.getModifiers(s)?.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword),
    );
  if (!hasDefault)
    found.push({ from: 0, to: 0, line: 1, message: "hook_error_no_default", severity: "error" });
  return found;
}

/**
 * Crea el servicio con los archivos `lib.*.d.ts` de TypeScript (por nombre) y la API pública.
 */
export function createHookTypesService(libs: Record<string, string>, hookDts: string) {
  let source = "";
  let version = 0;
  const files = new Map<string, string>([[TYPES_FILE, hookDts]]);
  for (const [name, text] of Object.entries(libs)) files.set(`/${name}`, text);

  const host: ts.LanguageServiceHost = {
    getScriptFileNames: () => [HOOK_FILE, TYPES_FILE],
    getScriptVersion: (name) => (name === HOOK_FILE ? String(version) : "0"),
    getScriptSnapshot: (name) => {
      const text = name === HOOK_FILE ? source : files.get(name);
      return text === undefined ? undefined : ts.ScriptSnapshot.fromString(text);
    },
    getCurrentDirectory: () => "/",
    getCompilationSettings: () => OPTIONS,
    getDefaultLibFileName: () => "/lib.es2022.d.ts",
    fileExists: (name) => name === HOOK_FILE || files.has(name),
    readFile: (name) => (name === HOOK_FILE ? source : files.get(name)),
  };
  const service = ts.createLanguageService(host, ts.createDocumentRegistry());

  const toDiagnostic = (d: ts.Diagnostic): HookDiagnostic => {
    const from = d.start ?? 0;
    const file = service.getProgram()?.getSourceFile(HOOK_FILE);
    return {
      from,
      to: from + (d.length ?? 0),
      line: (file?.getLineAndCharacterOfPosition(from).line ?? 0) + 1,
      message: ts.flattenDiagnosticMessageText(d.messageText, "\n"),
      severity: d.category === ts.DiagnosticCategory.Warning ? "warning" : "error",
    };
  };

  return {
    update(text: string) {
      source = text;
      version += 1;
    },
    diagnostics(): HookDiagnostic[] {
      const file = service.getProgram()?.getSourceFile(HOOK_FILE);
      const found = [
        ...service.getSyntacticDiagnostics(HOOK_FILE),
        ...service.getSemanticDiagnostics(HOOK_FILE),
      ].map(toDiagnostic);
      return file ? [...found, ...unsupported(file)].sort((a, b) => a.from - b.from) : found;
    },
    completions(position: number): HookCompletion[] {
      const result = service.getCompletionsAtPosition(HOOK_FILE, position, {
        includeCompletionsWithInsertText: true,
      });
      return (result?.entries ?? []).slice(0, 200).map((entry) => {
        const details = result?.isMemberCompletion
          ? service.getCompletionEntryDetails(
              HOOK_FILE,
              position,
              entry.name,
              {},
              undefined,
              {},
              undefined,
            )
          : undefined;
        const doc = details ? ts.displayPartsToString(details.documentation) : "";
        return {
          label: entry.name,
          kind: entry.kind,
          ...(doc ? { detail: doc } : {}),
        };
      });
    },
    quickInfo(position: number): string | null {
      const info = service.getQuickInfoAtPosition(HOOK_FILE, position);
      if (!info) return null;
      const signature = ts.displayPartsToString(info.displayParts);
      const doc = ts.displayPartsToString(info.documentation);
      return doc ? `${signature}\n${doc}` : signature;
    },
  };
}

export type HookTypesService = ReturnType<typeof createHookTypesService>;
