import { describe, expect, it } from "vitest";
import { classifyDebuggerError } from "../../src/background/chrome-debugger.ts";

describe("classifyDebuggerError", () => {
  it.each([
    ["Another debugger is already attached to the tab with id: 12.", "already_attached"],
    ["Cannot access a chrome:// URL", "restricted_page"],
    ["Cannot attach to this target.", "restricted_page"],
    ['Cannot access contents of url "https://chromewebstore.google.com/".', "restricted_page"],
    ["Debugger is not attached to the tab with id: 3.", "not_attached"],
    ['{"code":-32602,"message":"Invalid InterceptionId."}', "invalid_interception"],
    ['{"code":-32000,"message":"Something else"}', "cdp_error"],
  ])("%s ⇒ %s", (message, code) => {
    expect(classifyDebuggerError(message)).toBe(code);
  });
});
