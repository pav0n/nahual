import type { Profile } from "../../src/schemas/profile.ts";
import type { Rule } from "../../src/schemas/rule.ts";
import { SITE, rule } from "../fixtures.ts";

export const OTHER = "https://otro.test";
export const P1 = "0b8f8a52-4a0c-4d0e-9f3a-6c1d2e3f4a5b";
export const P2 = "1c9f8a52-4a0c-4d0e-9f3a-6c1d2e3f4a5b";
export const R1 = "3f1c2b4a-8d9e-4f60-a1b2-c3d4e5f60718";
export const R2 = "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d";
export const R3 = "5d4c3b2a-1e0f-4a9b-8c7d-6e5f4a3b2c1d";

export const profile = (overrides: Partial<Profile> = {}): Profile => ({
  id: P1,
  site: SITE,
  name: "QA staging",
  createdAt: 1,
  updatedAt: 1,
  ...overrides,
});

/** Tres reglas: una de pausa con condición de header sensible, un mock con secreto y un hook. */
export const existingRules = (): Rule[] => [
  rule({
    id: R1,
    order: 0,
    profileIds: [P1],
    conditions: [
      { kind: "header", name: "Authorization", op: "equals", value: "Bearer secret-rule" },
    ],
    stage: "response",
  }),
  rule({
    id: R2,
    order: 1,
    stage: "request",
    action: {
      kind: "mock",
      status: 200,
      headers: [
        { name: "set-cookie", value: "sid=secret-mock-cookie" },
        { name: "content-type", value: "application/json" },
      ],
      body: JSON.stringify({ token: "secret-mock-token", ok: true }),
      bodyEncoding: "text",
    },
  }),
  rule({
    id: R3,
    site: OTHER,
    order: 0,
    stage: "request",
    action: {
      kind: "hook",
      source: "export default (ctx) => ctx;",
      imported: false,
      permissions: { changeDestination: true, readSensitive: true },
      check: { hash: "abc", ok: true },
    },
  }),
];
