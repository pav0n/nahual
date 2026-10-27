import { DEFAULT_SETTINGS, type Settings } from "@nahual/domain";
import type { SessionState } from "@nahual/protocol";
import { beforeEach, describe, expect, it } from "vitest";
import { createAutoAttach, type AutoAttach } from "../../src/panel/auto-attach.ts";

let attaches: number;
let auto: AutoAttach;

const consent: Settings = { ...DEFAULT_SETTINGS, attachConsent: true };
const detached: SessionState = {
  status: "detached",
  cause: null,
  attachedAt: null,
  site: null,
  activeRuleCount: 0,
  queueSize: 0,
  globalPaused: false,
  relaxationCount: 0,
  activeProfileId: null,
};

beforeEach(() => {
  attaches = 0;
  auto = createAutoAttach(() => void attaches++);
});

describe("adjunto automático (FR-027a, FR-027b, research R17)", () => {
  it("sin consentimiento no adjunta", () => {
    auto.connected();
    auto.update(DEFAULT_SETTINGS, detached);
    expect(attaches).toBe(0);
  });

  it("con consentimiento y autoAttach adjunta una vez tras hello", () => {
    auto.connected();
    auto.update(consent, null);
    expect(attaches).toBe(0);
    auto.update(consent, detached);
    auto.update(consent, detached);
    expect(attaches).toBe(1);
  });

  it("con autoAttach desactivado espera a que el dev pulse Adjuntar", () => {
    auto.connected();
    auto.update({ ...consent, autoAttach: false }, detached);
    expect(attaches).toBe(0);
  });

  it("si ya está adjunto no reenvía attach", () => {
    auto.connected();
    auto.update(consent, { ...detached, status: "attached" });
    expect(attaches).toBe(0);
  });

  it("tras un Soltar manual no reenvía hasta Reconectar", () => {
    auto.connected();
    auto.update(consent, detached);
    auto.userDetached();
    auto.connected();
    auto.update(consent, detached);
    expect(attaches).toBe(1);
    auto.userAttached();
    auto.connected();
    auto.update(consent, detached);
    expect(attaches).toBe(2);
  });

  it("reconexión del puerto tras reiniciarse el SW: readjunta sin Soltar previo", () => {
    auto.connected();
    auto.update(consent, detached);
    auto.connected();
    auto.update(consent, detached);
    expect(attaches).toBe(2);
  });

  it("una nueva apertura del panel (instancia nueva) olvida el Soltar", () => {
    auto.userDetached();
    const fresh = createAutoAttach(() => void attaches++);
    fresh.connected();
    fresh.update(consent, detached);
    expect(attaches).toBe(1);
  });
});
