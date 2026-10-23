// Lógica de dominio pura (sin chrome.*): reglas, condiciones, evaluación y redacción
// (constitución, principio V). La usan el service worker, el protocolo y el panel.
export * from "./body.ts";
export * from "./match/glob.ts";
export * from "./schemas/action.ts";
export * from "./schemas/common.ts";
export * from "./schemas/condition.ts";
export * from "./schemas/exchange.ts";
export * from "./schemas/limits.ts";
export * from "./schemas/paused.ts";
export * from "./schemas/rule.ts";
export * from "./schemas/settings.ts";
export * from "./sensitive.ts";
