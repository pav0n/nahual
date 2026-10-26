import type { Page } from "@playwright/test";
import { transform } from "sucrase";
import { openApp, openPanel, tabIdOf } from "../fixtures/panel.ts";
import { expect, test } from "../fixtures/extension.ts";
import { saveResult } from "./cdp-lab.ts";

// 006-X2 (research R16): coste del tramo panel ⇒ sandbox ⇒ Worker con un hook trivial, en frío y en
// caliente, con un body de 1 MB, y tiempo de Sucrase para un hook típico (pendiente de D2 de 001).
// El tramo SW ⇔ panel se mide de punta a punta en hooks-perf.spec.ts (T060).

const percentile = (values: number[], p: number) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))] ?? 0;
};

async function roundTrips(panel: Page, where: string, code: string, n: number) {
  return panel.evaluate(
    async ([w, c, count]) => {
      const iframe = document.createElement("iframe");
      iframe.src = "/src/sandbox/hook-sandbox.html";
      iframe.hidden = true;
      const port = await new Promise<MessagePort>((resolve) => {
        window.addEventListener("message", (e) => resolve(e.ports[0] as MessagePort), {
          once: true,
        });
        document.body.append(iframe);
      });
      const times: number[] = [];
      for (let i = 0; i < count; i++) {
        const started = performance.now();
        await new Promise<void>((resolve) => {
          port.onmessage = () => resolve();
          port.postMessage({ type: "probe", id: i, where: w, code: c, ms: 2000 });
        });
        times.push(performance.now() - started);
      }
      iframe.remove();
      return times;
    },
    [where, code, n] as const,
  );
}

const HOOK = `import type { HookContext } from "./nahual-hooks";

interface Item { id: number; name: string; price?: number }

/** Cambia el precio de cada elemento y marca la respuesta. */
export default (ctx: HookContext) => {
  if (!ctx.response || ctx.response.status !== 200) return;
  const data = ctx.json<{ items: Item[]; total: number }>();
  data.items = data.items.map((item: Item): Item => ({ ...item, price: 0 }));
  data.total = data.items.length;
  ctx.setHeader("x-nahual", "hook");
  ctx.log("items", data.items.length);
  ctx.response.body = JSON.stringify(data);
  return ctx;
};
`.repeat(3);

test("X2: latencia del sandbox y tiempo de Sucrase", async ({
  context,
  nahualWorker,
  extensionId,
  servers,
}) => {
  await openApp(context, servers.appOrigin);
  const tabId = await tabIdOf(nahualWorker, `${servers.appOrigin}/`);
  const panel = await openPanel(context, extensionId, tabId);

  const cold = await roundTrips(panel, "worker", "return 1", 30);
  const warm = await roundTrips(panel, "warm", "return 1", 500);
  const big = JSON.stringify({
    items: Array.from({ length: 20_000 }, (_, i) => ({
      id: i,
      name: `item-${i}-xxxxxxxxxxxxxxxxxxxxxxxx`,
    })),
  });
  const warmBig = await roundTrips(panel, "warm", `return ${JSON.stringify(big)}.length`, 50);

  const sucrase: number[] = [];
  for (let i = 0; i < 50; i++) {
    const started = performance.now();
    transform(HOOK, { transforms: ["typescript", "imports"] });
    sucrase.push(performance.now() - started);
  }

  const summary = (values: number[]) => ({
    p50: Number(percentile(values, 50).toFixed(2)),
    p95: Number(percentile(values, 95).toFixed(2)),
  });
  const result = {
    coldWorker: summary(cold.slice(5)),
    warmWorker: summary(warm.slice(10)),
    warmWorker1MB: { ...summary(warmBig.slice(5)), bytes: big.length },
    sucraseNode: { ...summary(sucrase.slice(5)), lines: HOOK.split("\n").length },
  };
  saveResult("006-x2-hook-latency", result);
  expect(result.warmWorker.p95).toBeLessThan(10);
});
