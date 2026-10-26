// Monta los handlers MSW exportados con `setupServer` en un proceso Node aparte (como en un
// proyecto real) y repite los requests: imprime status, headers y body de cada respuesta.
// Uso: node replay.mjs <handlers.ts> <requests.json>
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { setupServer } from "msw/node";

const [handlersFile, requestsFile] = process.argv.slice(2);
const { handlers } = await import(pathToFileURL(handlersFile).href);
const requests = JSON.parse(readFileSync(requestsFile, "utf8"));
const server = setupServer(...handlers);
server.listen({ onUnhandledRequest: "error" });
const results = [];
for (const { url, method, headers, body } of requests) {
  const response = await fetch(url, { method, headers, ...(body ? { body } : {}) });
  results.push({
    status: response.status,
    headers: Object.fromEntries(response.headers),
    body: await response.text(),
  });
}
server.close();
process.stdout.write(JSON.stringify(results));
