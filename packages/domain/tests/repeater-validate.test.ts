import { describe, expect, it } from "vitest";
import { validateRepeaterRequest } from "../src/repeater/validate.ts";

const base = {
  method: "GET",
  url: "https://api.test/items",
  headers: [{ name: "accept", value: "*/*", enabled: true }],
  body: { kind: "none" },
};

describe("validateRepeaterRequest (005, FR-007)", () => {
  it("acepta un request válido", () => {
    const result = validateRepeaterRequest(base);
    expect(result.ok).toBe(true);
  });

  it("issues por campo con su clave i18n, sin el valor", () => {
    const result = validateRepeaterRequest({
      ...base,
      method: "G T",
      url: "ftp://x",
      headers: [{ name: "bad name", value: "secret-value", enabled: true }],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues).toEqual(
      expect.arrayContaining([
        { path: "method", messageKey: "rule_error_method" },
        { path: "url", messageKey: "rule_error_url" },
        { path: "headers.0.name", messageKey: "rule_error_header_name" },
      ]),
    );
    expect(JSON.stringify(result.issues)).not.toContain("secret-value");
  });

  it("body de más de 5 MB", () => {
    const result = validateRepeaterRequest({
      ...base,
      body: { kind: "text", text: "x".repeat(5 * 1024 * 1024 + 1) },
    });
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.issues).toContainEqual({
        path: "body.text",
        messageKey: "rule_error_body_too_large",
      });
  });

  it("un objeto que no es request ⇒ issue genérico", () => {
    expect(validateRepeaterRequest(null).ok).toBe(false);
  });
});
