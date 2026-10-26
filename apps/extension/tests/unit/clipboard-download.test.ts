import { describe, expect, it, vi } from "vitest";
import { copyText } from "../../src/panel/components/common/clipboard.ts";
import { downloadText } from "../../src/panel/components/common/download.ts";

describe("copyText (003 R14, 007 FR-009)", () => {
  const area = () => ({ focus: vi.fn(), select: vi.fn() });

  it("usa navigator.clipboard cuando está disponible", async () => {
    const writeText = vi.fn(() => Promise.resolve());
    expect(await copyText("hola", area(), { writeText })).toBe("copied");
    expect(writeText).toHaveBeenCalledWith("hola");
  });

  it("si clipboard falla o no existe, selecciona el texto y usa execCommand", async () => {
    const field = area();
    const execCommand = vi.fn(() => true);
    const writeText = vi.fn(() => Promise.reject(new Error("blocked")));
    expect(await copyText("hola", field, { writeText, execCommand })).toBe("copied");
    expect(field.select).toHaveBeenCalled();
    expect(await copyText("hola", field, { execCommand })).toBe("copied");
  });

  it("sin campo o con execCommand fallido, pide copiar a mano", async () => {
    expect(await copyText("hola", null, {})).toBe("manual");
    expect(await copyText("hola", area(), { execCommand: () => false })).toBe("manual");
    expect(
      await copyText("hola", area(), {
        execCommand: () => {
          throw new Error("x");
        },
      }),
    ).toBe("manual");
  });
});

describe("downloadText (006 FR-035, 007 FR-009)", () => {
  it("descarga con un Blob y un enlace, sin red, y libera la URL", () => {
    const link = { href: "", download: "", click: vi.fn() };
    const blobs: Blob[] = [];
    const revoke = vi.fn();
    let later: (() => void) | undefined;
    downloadText("a.ts", "código", "text/typescript", {
      createObjectURL: (blob) => (blobs.push(blob), "blob:1"),
      revokeObjectURL: revoke,
      createLink: () => link,
      defer: (fn) => (later = fn),
    });
    expect(link).toMatchObject({ href: "blob:1", download: "a.ts" });
    expect(link.click).toHaveBeenCalled();
    expect(blobs[0]?.type).toBe("text/typescript");
    later?.();
    expect(revoke).toHaveBeenCalledWith("blob:1");
  });
});
