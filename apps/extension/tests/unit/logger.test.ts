import { describe, expect, it } from "vitest";
import { createLogger } from "../../src/background/logger.ts";

function capture() {
  const lines: string[] = [];
  const sink = {
    warn: (...args: unknown[]) => void lines.push(args.map((a) => JSON.stringify(a)).join(" ")),
    error: (...args: unknown[]) => void lines.push(args.map((a) => JSON.stringify(a)).join(" ")),
  };
  return { lines, logger: createLogger(sink) };
}

describe("logger (FR-036)", () => {
  it("no registra URLs, valores de headers sensibles ni bodies aunque se le pasen", () => {
    const { lines, logger } = capture();
    logger.warn("Fallo al aplicar https://api.test/users?token=abc", {
      url: "https://api.test/users?token=abc",
      authorization: "Bearer secreto",
      Cookie: "sid=secreto",
      body: '{"password":"secreto","items":[1,2,3]}'.repeat(10),
      code: "cdp_error",
      count: 3,
    });
    logger.error("boom", { "x-api-key": "secreto" });
    const all = lines.join("\n");
    expect(all).not.toContain("api.test");
    expect(all).not.toContain("secreto");
    expect(all).not.toContain("password");
    expect(all).toContain("cdp_error");
    expect(all).toContain("3");
  });

  it("antepone [nahual] y conserva el mensaje fijo", () => {
    const { lines, logger } = capture();
    logger.warn("Mensaje descartado");
    expect(lines[0]).toContain("[nahual] Mensaje descartado");
  });
});
