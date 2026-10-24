import type { CapturedExchange, CorsDiagnosis, PausedItemView } from "@nahual/domain";

/** Intercambio capturado mínimo para pruebas del panel (004). */
export function exchange(overrides: Partial<CapturedExchange> = {}): CapturedExchange {
  return {
    id: "ex-1",
    seq: 1,
    method: "GET",
    url: "https://api.test/items?page=2",
    urlTruncated: false,
    resourceType: "Fetch",
    isPreflight: false,
    requestHeaders: [],
    responseHeaders: [],
    status: 200,
    state: "complete",
    encodedSize: 10,
    decodedSize: 10,
    startedAt: 1,
    durationMs: 5,
    mimeType: "application/json",
    requestBody: { available: false, size: null, reason: "none" },
    responseBody: { available: false, size: null, reason: "none" },
    ruleEffects: [],
    ...overrides,
  };
}

export function diagnosis(overrides: Partial<CorsDiagnosis> = {}): CorsDiagnosis {
  return {
    cause: "missing_allow_origin",
    browserCode: "MissingAllowOriginHeader",
    failedParameter: null,
    atPreflight: false,
    appOrigin: "http://localhost:3000",
    apiOrigin: "https://api.test",
    method: "GET",
    requestedHeaders: [],
    credentials: "no",
    responseStatus: 200,
    preflightStatus: null,
    serverCorsHeaders: [],
    preflightExchangeId: null,
    relaxable: true,
    ...overrides,
  };
}

/** Intercambio bloqueado por CORS. */
export const blocked = (overrides: Partial<CapturedExchange> = {}) =>
  exchange({ status: null, state: "failed", cors: { diagnosis: diagnosis() }, ...overrides });

export function pausedItem(overrides: Partial<PausedItemView> = {}): PausedItemView {
  return {
    pausedId: "p-1",
    exchangeId: "ex-1",
    stage: "response",
    ruleId: "6f0c2a52-6a1e-4c55-9d0a-2f6a1c1f9a10",
    ruleName: "Errores",
    pausedAt: 1,
    expiresAt: 60_001,
    request: {
      method: "GET",
      url: "https://api.test/items?page=2",
      headers: [],
      body: null,
      bodyInfo: { available: false, size: null, reason: "none" },
    },
    response: {
      status: 500,
      headers: [],
      body: "{}",
      bodyInfo: { available: true, size: 2 },
    },
    ...overrides,
  };
}
