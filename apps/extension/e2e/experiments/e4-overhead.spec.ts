import { tabIdOf } from "../fixtures/panel.ts";
import { test } from "../fixtures/extension.ts";
import { installLab, labSend, labTimings, percentile, saveResult, setPolicy } from "./cdp-lab.ts";

const N = Number(process.env.E4_N ?? 510);
const WARMUP = 10;

test("E4: overhead de interceptar sin pausar", async ({ context, nahualWorker, servers }) => {
  const page = await context.newPage();
  const target = process.env.E4_TARGET_URL; // opcional: URL de la API de la app del equipo
  await page.goto(`${servers.appOrigin}/load`);
  const tabId = await tabIdOf(nahualWorker, `${servers.appOrigin}/load`);
  const url = target ?? `${servers.apiOrigin}/data`;

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
  await installLab(nahualWorker, tabId);
  await setPolicy(nahualWorker, { name: "continue" });
  const r2 = await run();
  await labSend(nahualWorker, tabId, "Fetch.enable", {
    patterns: [{ urlPattern: "*", requestStage: "Request" }],
  });
  await labTimings(nahualWorker);
  const r3 = await run();
  const sw = (await labTimings(nahualWorker)).slice(WARMUP);

  const s1 = summary(r1);
  const s3 = summary(r3);
  saveResult("e4-overhead", {
    userAgent: await nahualWorker.evaluate(() => navigator.userAgent),
    target: target ? "app del equipo" : "fixture local (127.0.0.1)",
    runs: {
      "1 sin debugger": s1,
      "2 debugger sin Fetch": summary(r2),
      "3 Fetch que continúa al instante": s3,
    },
    swPausedToContinue: summary(sw),
    overhead: {
      p50: Math.round((s3.p50 - s1.p50) * 100) / 100,
      p95: Math.round((s3.p95 - s1.p95) * 100) / 100,
    },
    budgetP95Ms: 20,
  });
});
