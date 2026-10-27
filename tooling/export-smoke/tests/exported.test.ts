import { execFile } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { exportAs, type ExportSource } from "@nahual/domain/export";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ZodType } from "zod";
import {
  EXPORT_TOKEN,
  startServers,
  type TestServers,
} from "../../../apps/extension/e2e/fixtures/servers.ts";

// 007, T023 (SC-001, SC-002, SC-003): lo exportado se escribe a disco y se ejecuta con las
// versiones objetivo (Vitest 5, MSW 3, Zod 4) contra el servidor de prueba.

const run = promisify(execFile);
const ROOT = path.resolve(import.meta.dirname, "..");
const OUT = path.join(ROOT, ".generated", String(process.pid));
const VITEST = path.join(ROOT, "node_modules", "vitest", "vitest.mjs");
// `--config false` no existe en Vitest 5: sin archivo de configuración en `OUT`, usa los defaults.
const options = { appVersion: "1.0.0", includeSensitive: false };

let servers: TestServers;

/** Hace el request de verdad y arma la fuente como la armaría el panel con lo capturado. */
async function capture(
  method: string,
  route: string,
  headers: Record<string, string> = {},
  body?: { text: string; contentType: string },
): Promise<ExportSource> {
  const url = `${servers.apiOrigin}${route}`;
  const all = { ...headers, ...(body ? { "content-type": body.contentType } : {}) };
  const response = await fetch(url, { method, headers: all, ...(body ? { body: body.text } : {}) });
  const text = await response.text();
  const contentType = response.headers.get("content-type");
  return {
    request: {
      method,
      url,
      headers: Object.entries(all).map(([name, value]) => ({ name, value })),
      body: body
        ? body.contentType.startsWith("application/x-www-form-urlencoded")
          ? {
              kind: "form",
              fields: [...new URLSearchParams(body.text)].map(([name, value]) => ({ name, value })),
            }
          : { kind: "text", text: body.text, contentType: body.contentType }
        : { kind: "none" },
    },
    response: {
      status: response.status,
      headers: [...response.headers].map(([name, value]) => ({ name, value })),
      body: { kind: "text", text, contentType },
      mimeType: contentType,
    },
    capturedAt: 1_761_422_400_000,
  };
}

function write(name: string, code: string): string {
  const file = path.join(OUT, name);
  writeFileSync(file, code);
  return file;
}

/** Ejecuta un test exportado con el Vitest del proyecto de prueba, como en un proyecto Vite. */
async function vitest(file: string, env: Record<string, string>) {
  try {
    const { stdout, stderr } = await run(
      process.execPath,
      [VITEST, "run", path.basename(file), "--root", OUT, "--reporter", "verbose"],
      { cwd: OUT, env: { ...process.env, ...env, NO_COLOR: "1" } },
    );
    return { ok: true, output: stdout + stderr };
  } catch (error) {
    const e = error as { stdout?: string; stderr?: string };
    return { ok: false, output: `${e.stdout ?? ""}${e.stderr ?? ""}` };
  }
}

beforeAll(async () => {
  mkdirSync(OUT, { recursive: true });
  servers = await startServers();
});

afterAll(async () => {
  await servers?.close();
  rmSync(OUT, { recursive: true, force: true });
});

describe("test Vitest exportado (SC-001)", () => {
  let file = "";

  beforeAll(async () => {
    const source = await capture("GET", "/export/items?page=1", {
      accept: "application/json",
      authorization: EXPORT_TOKEN,
    });
    const result = exportAs("vitest", [source], options);
    expect(result.code).not.toContain("secret-export-token");
    file = write(result.fileName, result.code);
  });

  it("corre sin editarlo y pasa con la credencial en la variable de entorno", async () => {
    const result = await vitest(file, { NAHUAL_AUTHORIZATION: EXPORT_TOKEN });
    expect(result.output).toContain("responds 200 with the captured shape");
    expect(result.ok, result.output).toBe(true);
  });

  it("sin la variable falla diciendo cuál falta", async () => {
    const result = await vitest(file, { NAHUAL_AUTHORIZATION: "" });
    expect(result.ok).toBe(false);
    expect(result.output).toContain("Missing NAHUAL_AUTHORIZATION");
  });
});

describe("handlers MSW exportados (SC-002)", () => {
  it("reproducen status, headers no sensibles y body de 5 respuestas capturadas", async () => {
    const sources = [
      await capture("GET", "/export/items?page=1", { accept: "application/json" }),
      await capture("GET", "/export/items/4"),
      await capture(
        "POST",
        "/export/items",
        {},
        { text: '{"a":1}', contentType: "application/json" },
      ),
      await capture(
        "POST",
        "/export/form",
        {},
        { text: "a=1&b=2", contentType: "application/x-www-form-urlencoded" },
      ),
      await capture("GET", "/export/items/7"),
    ];
    const result = exportAs("msw", sources, options);
    expect(result.merged).toEqual([]);
    const handlers = write("handlers.ts", result.code);
    const requests = write(
      "requests.json",
      JSON.stringify(
        sources.map(({ request }) => ({
          url: request.url,
          method: request.method,
          headers: Object.fromEntries(request.headers.map((h) => [h.name, h.value])),
          body:
            request.body.kind === "text"
              ? request.body.text
              : request.body.kind === "form"
                ? new URLSearchParams(
                    request.body.fields.map((f): [string, string] => [f.name, f.value]),
                  ).toString()
                : null,
        })),
      ),
    );
    // Con el servidor real apagado, las respuestas solo pueden venir de los handlers.
    await servers.close();
    try {
      const { stdout } = await run(
        process.execPath,
        [path.join(ROOT, "tests", "replay.mjs"), handlers, requests],
        {
          cwd: OUT,
        },
      );
      const replies = JSON.parse(stdout) as {
        status: number;
        headers: Record<string, string>;
        body: string;
      }[];
      expect(replies).toHaveLength(5);
      replies.forEach((reply, i) => {
        const response = sources[i]?.response;
        expect(reply.status).toBe(response?.status);
        expect(reply.headers["x-request-id"]).toBe(
          response?.headers.find((h) => h.name === "x-request-id")?.value,
        );
        expect(reply.headers["set-cookie"]).toBeUndefined();
        const expected = response?.body.kind === "text" ? JSON.parse(response.body.text) : null;
        expect(JSON.parse(reply.body)).toEqual(expected);
      });
    } finally {
      servers = await startServers();
    }
  });
});

describe("schema Zod exportado (SC-003)", () => {
  it("acepta las 3 páginas y rechaza un tipo cambiado", async () => {
    const sources = [
      await capture("GET", "/export/items?page=1"),
      await capture("GET", "/export/items?page=2"),
      await capture("GET", "/export/items?page=3"),
    ];
    const result = exportAs("zod", sources, options);
    const file = write("items.schema.ts", result.code);
    const module = (await import(pathToFileURL(file).href)) as Record<string, ZodType>;
    const schema = Object.values(module)[0] as ZodType;
    const bodies = sources.map((s) =>
      s.response?.body.kind === "text" ? JSON.parse(s.response.body.text) : null,
    );
    for (const body of bodies) expect(schema.safeParse(body).success).toBe(true);
    const changed = structuredClone(bodies[0]) as { items: { id: unknown }[] };
    const first = changed.items[0];
    if (first) first.id = "1";
    expect(schema.safeParse(changed).success).toBe(false);
  });
});

describe("servidor caído (FR-013)", () => {
  it("el test exportado falla diciendo que el servidor no responde", async () => {
    const source = await capture("GET", "/export/items/2");
    const result = exportAs("vitest", [source], options);
    const file = write("unreachable.contract.test.ts", result.code);
    await servers.close();
    try {
      const outcome = await vitest(file, {});
      expect(outcome.ok).toBe(false);
      expect(outcome.output).toContain(`Server unreachable at ${servers.apiOrigin}`);
    } finally {
      servers = await startServers();
    }
  });
});
