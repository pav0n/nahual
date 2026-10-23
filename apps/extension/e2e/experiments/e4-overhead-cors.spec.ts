import {
  attach,
  openPanel,
  relaxExtraOrigins,
  relaxIndicator,
  tabIdOf,
} from "../fixtures/panel.ts";
import { expect, test } from "../fixtures/extension.ts";
import { percentile, saveResult } from "./cdp-lab.ts";

// research R17 / SC-007 (003): overhead por intercambio relajado frente a sin Nahual, con el
// camino real (panel, CorsRelaxer, RuleEngine, continueResponse con headers).

const N = Number(process.env.E4_N ?? 510);
const WARMUP = 10;

test("R17: overhead de la relajación CORS", async ({
  context,
  nahualWorker,
  extensionId,
  servers,
}) => {
  test.setTimeout(300_000);
  const page = await context.newPage();
  await page.goto(`${servers.appOrigin}/load`);
  const tabId = await tabIdOf(nahualWorker, `${servers.appOrigin}/load`);

  const run = async (path: string) =>
    (
      (await page.evaluate(
        ([u, n]) =>
          (window as unknown as { runLoad(u: string, n: number): Promise<number[]> }).runLoad(
            u as string,
            n as number,
          ),
        [`${servers.apiOrigin}${path}`, N] as const,
      )) as number[]
    ).slice(WARMUP);
  const summary = (values: number[]) => ({
    n: values.length,
    p50: percentile(values, 50),
    p95: percentile(values, 95),
  });

  // 1: sin debugger, contra una ruta con CORS correcto (la base).
  const r1 = await run("/cors/ok");

  const panel = await openPanel(context, extensionId, tabId);
  await attach(panel);
  expect(await relaxExtraOrigins(panel, tabId, servers.appOrigin, 1, [servers.apiOrigin])).toEqual([
    true,
  ]);
  await expect(relaxIndicator(panel)).toBeVisible({ timeout: 5_000 });

  // 2: relajada, el servidor no envía CORS (continueResponse con headers).
  const r2 = await run("/cors/none");
  // 3: relajada, el servidor ya responde bien (continúa sin cambios).
  const r3 = await run("/cors/ok");

  const s1 = summary(r1);
  const s2 = summary(r2);
  const s3 = summary(r3);
  const overhead = (s: { p50: number; p95: number }) => ({
    p50: Math.round((s.p50 - s1.p50) * 100) / 100,
    p95: Math.round((s.p95 - s1.p95) * 100) / 100,
  });
  const result = {
    userAgent: await nahualWorker.evaluate(() => navigator.userAgent),
    target: "fixture local (127.0.0.1)",
    runs: {
      "1 sin debugger (/cors/ok)": s1,
      "2 relajada, sin CORS del servidor (/cors/none)": s2,
      "3 relajada, el servidor ya responde bien (/cors/ok)": s3,
    },
    overhead: { "2": overhead(s2), "3": overhead(s3) },
    budgetP95Ms: 20,
  };
  saveResult("r17-overhead-cors", result);
  expect(result.overhead["2"].p95).toBeLessThan(20);
  expect(result.overhead["3"].p95).toBeLessThan(20);
});
