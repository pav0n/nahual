// Tipos de los hooks de Nahual (contracts/hook-api.md). Este archivo se descarga como
// `nahual-hooks.d.ts` con "Descargar tipos": un hook puede importar sus tipos
// (`import type { HookContext } from "./nahual-hooks"`) o usarlos como globales.
// Un hook corre aislado: sin red, sin DOM y sin `chrome`. Solo hay globales de ECMAScript y los
// que se declaran aquí.

/** Por qué un body tiene o no contenido de texto. */
interface NahualBodyInfo {
  readonly kind: "text" | "binary" | "tooLarge" | "none";
  readonly contentType: string | null;
  /** Bytes, si se conocen. */
  readonly size: number | null;
}

/** El request. En etapa Response es de solo lectura. */
interface NahualHookRequest {
  method: string;
  /** Cambiar el origen (esquema, host o puerto) exige el permiso "puede cambiar el destino". */
  url: string;
  /**
   * Nombres en minúsculas. Los repetidos van unidos con ", " (`set-cookie`, con un salto de
   * línea). Sin el permiso "puede leer valores sensibles", los sensibles valen "••••••": dejarlos
   * así conserva el valor real.
   */
  headers: Record<string, string>;
  /** Texto del body, o `null` si no es texto (ver `bodyInfo`). Asignar un texto lo reemplaza. */
  body: string | null;
  readonly bodyInfo: NahualBodyInfo;
}

/** La respuesta (solo en etapa Response). */
interface NahualHookResponse {
  /** 100–599. */
  status: number;
  headers: Record<string, string>;
  body: string | null;
  readonly bodyInfo: NahualBodyInfo;
}

interface NahualRespondInit {
  /** 100–599. */
  status: number;
  headers?: Record<string, string>;
  /** Un objeto se envía como JSON. */
  body?: string | object;
}

/** Lo que recibe un hook. Devuélvelo (cambiado o no), o no devuelvas nada para no cambiar nada. */
interface NahualHookContext {
  readonly stage: "request" | "response";
  /** "Fetch", "XHR", "Document", "Script"… */
  readonly resourceType: string;
  /** Origen de la página inspeccionada. */
  readonly site: string;
  request: NahualHookRequest;
  /** `null` en etapa Request. */
  response: NahualHookResponse | null;
  /**
   * Compartido por todos los hooks de la pestaña hasta cerrar el panel (sobrevive a recargas).
   * Solo valores JSON, hasta 1 MB.
   */
  state: Record<string, unknown>;
  /** Escribe en la consola de hooks, como texto (los valores con nombre sensible se redactan). */
  log(...values: unknown[]): void;
  /** Body JSON de la etapa (una copia). Lanza si no es JSON válido. */
  json<T = unknown>(): T;
  /** Fija un header en la parte de la etapa (request en Request, respuesta en Response). */
  setHeader(name: string, value: string): void;
  removeHeader(name: string): void;
  /** Datos GraphQL del request, si lo es. */
  readonly graphql: { readonly operationName: string | null } | null;
  /** Solo etapa Request: responde sin que el request llegue al servidor. */
  respond(init: NahualRespondInit): void;
}

export type HookContext = NahualHookContext;
export type HookRequest = NahualHookRequest;
export type HookResponse = NahualHookResponse;
export type BodyInfo = NahualBodyInfo;
export type RespondInit = NahualRespondInit;
/** Firma de un hook: `export default (ctx: HookContext) => ...`. */
// `void` es parte del contrato: un hook puede no devolver nada (contracts/hook-api.md).
/* eslint-disable @typescript-eslint/no-invalid-void-type */
export type Hook = (
  ctx: NahualHookContext,
) => NahualHookContext | void | Promise<NahualHookContext | void>;
/* eslint-enable @typescript-eslint/no-invalid-void-type */

declare global {
  type HookContext = NahualHookContext;
  type HookRequest = NahualHookRequest;
  type HookResponse = NahualHookResponse;

  /** Redirigido a `ctx.log`. */
  const console: {
    log(...values: unknown[]): void;
    info(...values: unknown[]): void;
    warn(...values: unknown[]): void;
    error(...values: unknown[]): void;
    debug(...values: unknown[]): void;
  };

  function setTimeout(handler: () => void, ms?: number): number;
  function clearTimeout(id: number | undefined): void;
  function structuredClone<T>(value: T): T;

  const crypto: {
    getRandomValues<
      T extends Int8Array | Uint8Array | Int16Array | Uint16Array | Int32Array | Uint32Array,
    >(
      array: T,
    ): T;
    randomUUID(): string;
  };

  class URLSearchParams {
    constructor(init?: string | Record<string, string> | [string, string][]);
    get(name: string): string | null;
    getAll(name: string): string[];
    has(name: string): boolean;
    set(name: string, value: string): void;
    append(name: string, value: string): void;
    delete(name: string): void;
    toString(): string;
    entries(): IterableIterator<[string, string]>;
    [Symbol.iterator](): IterableIterator<[string, string]>;
  }

  class URL {
    constructor(url: string, base?: string);
    hash: string;
    host: string;
    hostname: string;
    href: string;
    readonly origin: string;
    pathname: string;
    port: string;
    protocol: string;
    search: string;
    readonly searchParams: URLSearchParams;
    toString(): string;
  }

  class TextEncoder {
    encode(input?: string): Uint8Array;
  }

  class TextDecoder {
    constructor(label?: string);
    decode(input?: Uint8Array): string;
  }

  function atob(data: string): string;
  function btoa(data: string): string;
}
