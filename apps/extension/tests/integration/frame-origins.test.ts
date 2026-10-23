import { beforeEach, describe, expect, it } from "vitest";
import { createFrameOrigins, type FrameOrigins } from "../../src/background/frame-origins.ts";
import { frameDetached, frameNavigated } from "../fakes/cdp-events.ts";
import { FakeDebugger } from "../fakes/fake-debugger.ts";

let cdp: FakeDebugger;
let frames: FrameOrigins;

beforeEach(async () => {
  cdp = new FakeDebugger();
  await cdp.attach(1);
  await cdp.attach(2);
  frames = createFrameOrigins({ debugger: cdp });
});

describe("FrameOrigins: frameId ⇒ origen por pestaña (research R4)", () => {
  it("Page.frameNavigated del frame principal y de subframes", () => {
    cdp.emit(1, "Page.frameNavigated", frameNavigated("http://localhost:3000/app"));
    cdp.emit(
      1,
      "Page.frameNavigated",
      frameNavigated("http://third.test:4312/frame", "main", { id: "f1" }),
    );
    expect(frames.originOf(1, "main")).toBe("http://localhost:3000");
    expect(frames.originOf(1, "f1")).toBe("http://third.test:4312");
    expect(frames.originOf(2, "main")).toBeNull();
  });

  it("prefiere securityOrigin (p. ej. about:blank hereda el del padre)", () => {
    cdp.emit(
      1,
      "Page.frameNavigated",
      frameNavigated("about:blank", "main", { id: "f2", securityOrigin: "http://localhost:3000" }),
    );
    expect(frames.originOf(1, "f2")).toBe("http://localhost:3000");
  });

  it("origen opaco o desconocido ⇒ null", () => {
    cdp.emit(
      1,
      "Page.frameNavigated",
      frameNavigated("data:text/html,x", "main", { id: "f3", securityOrigin: "null" }),
    );
    expect(frames.originOf(1, "f3")).toBeNull();
    expect(frames.originOf(1, "nope")).toBeNull();
    expect(frames.originOf(1, undefined)).toBeNull();
  });

  it("frameDetached lo quita; navegar el principal descarta los subframes", () => {
    cdp.emit(1, "Page.frameNavigated", frameNavigated("http://localhost:3000/"));
    cdp.emit(1, "Page.frameNavigated", frameNavigated("http://c.test/", "main", { id: "f1" }));
    cdp.emit(1, "Page.frameDetached", frameDetached("f1"));
    expect(frames.originOf(1, "f1")).toBeNull();
    cdp.emit(1, "Page.frameNavigated", frameNavigated("http://c.test/", "main", { id: "f4" }));
    cdp.emit(1, "Page.frameNavigated", frameNavigated("http://otra.test/"));
    expect(frames.originOf(1, "f4")).toBeNull();
    expect(frames.originOf(1, "main")).toBe("http://otra.test");
  });

  it("hasOrigin para el estado idle de la relajación", () => {
    cdp.emit(1, "Page.frameNavigated", frameNavigated("http://localhost:3000/"));
    cdp.emit(1, "Page.frameNavigated", frameNavigated("http://c.test/", "main", { id: "f1" }));
    expect(frames.hasOrigin(1, "http://localhost:3000")).toBe(true);
    expect(frames.hasOrigin(1, "http://c.test")).toBe(true);
    expect(frames.hasOrigin(1, "http://b.test")).toBe(false);
  });

  it("seed lee el árbol de frames al adjuntar", async () => {
    cdp.respond("Page.getFrameTree", () => ({
      frameTree: {
        frame: {
          id: "main",
          url: "http://localhost:3000/",
          securityOrigin: "http://localhost:3000",
        },
        childFrames: [{ frame: { id: "f9", url: "http://c.test/frame", parentId: "main" } }],
      },
    }));
    await frames.seed(1);
    expect(frames.originOf(1, "main")).toBe("http://localhost:3000");
    expect(frames.originOf(1, "f9")).toBe("http://c.test");
  });

  it("seed que falla no lanza", async () => {
    cdp.failSend("Page.getFrameTree", "cdp_error");
    await expect(frames.seed(1)).resolves.toBeUndefined();
  });

  it("al soltar se vacía la pestaña", () => {
    cdp.emit(1, "Page.frameNavigated", frameNavigated("http://localhost:3000/"));
    frames.sessionEnded(1);
    expect(frames.originOf(1, "main")).toBeNull();
    expect(frames.hasOrigin(1, "http://localhost:3000")).toBe(false);
  });
});
