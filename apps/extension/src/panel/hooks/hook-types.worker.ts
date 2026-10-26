// Worker del servicio de lenguaje de los hooks (006, research R4): se carga solo al abrir el editor
// de un hook (FR-019). Sin red: solo analiza el texto que le manda el panel.
import hookDts from "../../../../../packages/hook-runtime/src/hook-context.d.ts?raw";
import { createHookTypesService } from "./hook-types-service.ts";
import { TypesRequestSchema, type TypesReply } from "./types-protocol.ts";

const files = import.meta.glob<string>(
  [
    "/node_modules/typescript/lib/lib.es5.d.ts",
    "/node_modules/typescript/lib/lib.es20*.d.ts",
    "/node_modules/typescript/lib/lib.decorators*.d.ts",
  ],
  { query: "?raw", import: "default", eager: true },
);
const libs = Object.fromEntries(
  Object.entries(files).map(([path, text]) => [path.split("/").pop() ?? path, text]),
);
const service = createHookTypesService(libs, hookDts);
const reply = (message: TypesReply) => postMessage(message);

addEventListener("message", (event: MessageEvent) => {
  const parsed = TypesRequestSchema.safeParse(event.data);
  if (!parsed.success) return;
  const request = parsed.data;
  if (request.type === "update") {
    service.update(request.source);
    reply({
      type: "diagnostics",
      id: request.id,
      diagnostics: service.diagnostics().slice(0, 500),
    });
  } else if (request.type === "complete") {
    reply({
      type: "completions",
      id: request.id,
      completions: service.completions(request.position),
    });
  } else {
    reply({ type: "info", id: request.id, text: service.quickInfo(request.position) });
  }
});
