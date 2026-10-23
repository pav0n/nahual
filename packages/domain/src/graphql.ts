const DEFINITION = /\b(?:query|mutation|subscription)\s+([_A-Za-z][_0-9A-Za-z]*)/;

interface GraphqlRequest {
  method: string;
  url: string;
  body: string | null;
}

function operationOf(entry: unknown): string | null | undefined {
  if (typeof entry !== "object" || entry === null) return undefined;
  const { query, operationName } = entry as { query?: unknown; operationName?: unknown };
  if (typeof query !== "string") return undefined;
  if (typeof operationName === "string" && operationName !== "") return operationName;
  // Expresión acotada sobre los primeros 4 KB del query (research R6, R19).
  return DEFINITION.exec(query.slice(0, 4096))?.[1] ?? null;
}

/**
 * Operaciones de un request GraphQL, o `null` si no es GraphQL (research R6). Body JSON (objeto o
 * batch) o `GET` con `query` en la URL; `operationName` del campo o de la primera definición.
 */
export function graphqlOperations(request: GraphqlRequest): (string | null)[] | null {
  if (request.method.toUpperCase() === "GET") {
    try {
      const params = new URL(request.url).searchParams;
      const op = operationOf({
        query: params.get("query") ?? undefined,
        operationName: params.get("operationName") ?? undefined,
      });
      return op === undefined ? null : [op];
    } catch {
      return null;
    }
  }
  if (request.body === null) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(request.body);
  } catch {
    return null;
  }
  const entries = Array.isArray(parsed) ? parsed : [parsed];
  const ops = entries.map(operationOf);
  if (ops.length === 0 || ops.some((op) => op === undefined)) return null;
  return ops as (string | null)[];
}

/** `errors` presente ⇔ arreglo no vacío en la respuesta (o en alguna, si es un batch). */
export function graphqlHasErrors(json: unknown): boolean {
  const entries = Array.isArray(json) ? json : [json];
  return entries.some((entry) => {
    if (typeof entry !== "object" || entry === null) return false;
    const { errors } = entry as { errors?: unknown };
    return Array.isArray(errors) && errors.length > 0;
  });
}
