import { MASK } from "@nahual/domain";
import { describe, expect, it } from "vitest";
import { maskSensitive, mergeMasked } from "../src/mask.ts";
import { responseContext } from "./fixtures.ts";

describe("maskSensitive (FR-004, R5)", () => {
  it("sin permiso enmascara los headers sensibles de request y response", () => {
    const masked = maskSensitive(
      {
        ...responseContext(),
        request: {
          ...responseContext().request,
          headers: {
            authorization: "Bearer s",
            cookie: "c=1",
            "x-api-key": "k",
            accept: "*/*",
            "x-token": "",
          },
        },
      },
      false,
    );
    expect(masked.request.headers).toEqual({
      authorization: MASK,
      cookie: MASK,
      "x-api-key": MASK,
      accept: "*/*",
      "x-token": "",
    });
    expect(masked.response?.headers["set-cookie"]).toBe(MASK);
  });

  it("con permiso devuelve el contexto sin cambios", () => {
    const ctx = responseContext();
    expect(maskSensitive(ctx, true)).toBe(ctx);
  });
});

describe("mergeMasked", () => {
  const original = responseContext();
  const masked = maskSensitive(original, false);

  it("la máscara sin tocar recupera el valor original", () => {
    expect(mergeMasked(original, masked)).toEqual(original);
  });

  it("un valor nuevo reemplaza; un header quitado desaparece", () => {
    const returned = structuredClone(masked);
    returned.request.headers.authorization = "Bearer nuevo";
    delete returned.response?.headers["set-cookie"];
    const merged = mergeMasked(original, returned);
    expect(merged.request.headers.authorization).toBe("Bearer nuevo");
    expect(merged.response?.headers).not.toHaveProperty("set-cookie");
  });

  it("la máscara en un header que no existía queda como texto literal", () => {
    const returned = structuredClone(masked);
    returned.request.headers["x-copia"] = MASK;
    expect(mergeMasked(original, returned).request.headers["x-copia"]).toBe(MASK);
  });
});
