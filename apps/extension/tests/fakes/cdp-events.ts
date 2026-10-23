import type { RequestPausedEvent } from "../../src/background/debugger-port.ts";

// Constructores de eventos CDP para las pruebas de integración (CDP simulado).

let seq = 0;
export const nextId = (prefix = "req") => `${prefix}-${++seq}`;

export function requestWillBeSent(
  requestId: string,
  overrides: {
    url?: string;
    method?: string;
    type?: string;
    headers?: Record<string, string>;
    postData?: string;
    hasPostData?: boolean;
    timestamp?: number;
    redirectResponse?: { url: string; status: number; headers: Record<string, string> };
  } = {},
) {
  return {
    requestId,
    loaderId: "loader-1",
    documentURL: "https://app.test/",
    type: overrides.type ?? "Fetch",
    timestamp: overrides.timestamp ?? 1,
    wallTime: 1_700_000_000,
    request: {
      url: overrides.url ?? "https://api.test/items",
      method: overrides.method ?? "GET",
      headers: overrides.headers ?? { accept: "application/json" },
      ...(overrides.postData !== undefined ? { postData: overrides.postData } : {}),
      ...(overrides.hasPostData !== undefined ? { hasPostData: overrides.hasPostData } : {}),
    },
    ...(overrides.redirectResponse ? { redirectResponse: overrides.redirectResponse } : {}),
  };
}

export function responseReceived(
  requestId: string,
  overrides: {
    status?: number;
    mimeType?: string;
    headers?: Record<string, string>;
    encodedDataLength?: number;
    timestamp?: number;
  } = {},
) {
  return {
    requestId,
    type: "Fetch",
    timestamp: overrides.timestamp ?? 2,
    response: {
      url: "https://api.test/items",
      status: overrides.status ?? 200,
      statusText: "",
      mimeType: overrides.mimeType ?? "application/json",
      headers: overrides.headers ?? { "content-type": "application/json" },
      encodedDataLength: overrides.encodedDataLength ?? 0,
    },
  };
}

export const loadingFinished = (requestId: string, encodedDataLength = 100, timestamp = 3) => ({
  requestId,
  timestamp,
  encodedDataLength,
});

export const loadingFailed = (requestId: string, errorText = "net::ERR_FAILED", timestamp = 3) => ({
  requestId,
  timestamp,
  type: "Fetch",
  errorText,
  canceled: false,
});

export function requestPaused(
  requestId: string,
  overrides: Partial<Omit<RequestPausedEvent, "request">> & {
    request?: Partial<RequestPausedEvent["request"]>;
  } = {},
): RequestPausedEvent {
  const { request, ...rest } = overrides;
  return {
    requestId,
    resourceType: "Fetch",
    networkId: requestId.replace(/^fetch-/, ""),
    ...rest,
    request: {
      url: "https://api.test/items",
      method: "GET",
      headers: { accept: "application/json" },
      ...request,
    },
  };
}

export const frameNavigated = (url: string, parentId?: string) => ({
  frame: { id: parentId ? "child" : "main", url, ...(parentId ? { parentId } : {}) },
  type: "Navigation",
});
