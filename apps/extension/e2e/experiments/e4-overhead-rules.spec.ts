import { attach, createRule, openPanel, openTab, tabIdOf } from "../fixtures/panel.ts";
import { expect, test } from "../fixtures/extension.ts";
import { percentile, saveResult } from "./cdp-lab.ts";

// research R20 / SC-002: overhead por request interceptado sin pausa, con el camino real de 002
// (panel, reglas guardadas, RuleEngine). Cuatro corridas de N fetch secuenciales.

const N = Number(process.env.E4_N ?? 510);
const WARMUP = 10;

test("R20: overhead con reglas que no se cumplen", async ({
  context,
  nahualWorker,
  extensionId,
  servers,
}) => {
  test.setTimeout(300_000);
  const page = await context.newPage();
  await page.goto(`${servers.appOrigin}/load`);
  const tabId = await tabIdOf(nahualWorker, `${servers.appOrigin}/load`);
  const url = `${servers.apiOrigin}/data`;

  const run = async () =>
    (
      (await page.evaluate(
        ([u, n]) =>
          (window as unknown as { runLoad(u: string, n: number): Promise<number[]> }).runLoad(
            u as string,
            n as number,
          ),
        [url, N] as const,
      )) as number[]
    ).slice(WARMUP);
  const summary = (values: number[]) => ({
    n: values.length,
    p50: percentile(values, 50),
    p95: percentile(values, 95),
  });

  const r1 = await run();

  const panel = await openPanel(context, extensionId, tabId);
  await attach(panel);
  const r2 = await run();

  await createRule(panel, {
    name: "Request sin cumplir",
    pattern: "*/data*",
    stage: "request",
    conditions: [{ kind: "Header", op: "exists", fields: { "Header name": "x-never" } }],
  });
  const r3 = await run();

  await openTab(panel, "Rules");
  await panel.getByRole("switch", { name: /Request sin cumplir/ }).uncheck();
  await createRule(panel, {
    name: "Response sin cumplir",
    pattern: "*/data*",
    stage: "response",
    conditions: [{ kind: "Body JSONPath", op: "exists", fields: { JSONPath: "$.never" } }],
  });
  const r4 = await run();

  const s1 = summary(r1);
  const s3 = summary(r3);
  const s4 = summary(r4);
  const overhead = (s: { p50: number; p95: number }) => ({
    p50: Math.round((s.p50 - s1.p50) * 100) / 100,
    p95: Math.round((s.p95 - s1.p95) * 100) / 100,
  });
  const result = {
    userAgent: await nahualWorker.evaluate(() => navigator.userAgent),
    target: "fixture local (127.0.0.1)",
    runs: {
      "1 sin debugger": s1,
      "2 adjunto, sin reglas (solo Network)": summary(r2),
      "3 regla Request: prefiltro coincide, condición de header no": s3,
      "4 regla Response: prefiltro coincide, JSONPath no (pide el body)": s4,
    },
    overhead: { "3": overhead(s3), "4": overhead(s4) },
    budgetP95Ms: 20,
  };
  saveResult("r20-overhead-rules", result);
  console.log(`[R20] ${JSON.stringify(result, null, 2)}`);
  expect(result.overhead["3"].p95).toBeLessThan(20);
  expect(result.overhead["4"].p95).toBeLessThan(20);
});
