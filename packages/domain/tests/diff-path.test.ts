import { describe, expect, it } from "vitest";
import { formatPath } from "../src/diff/path.ts";

describe("formatPath (005)", () => {
  it.each([
    [[], "$"],
    [[{ key: "a" }, { key: "b" }, { index: 2 }], "$.a.b[2]"],
    [[{ key: "items" }, { idField: "id", id: 42 }, { key: "price" }], "$.items[id=42].price"],
    [[{ idField: "uuid", id: "x-1" }], '$[uuid="x-1"]'],
    [[{ key: "x-y" }], '$["x-y"]'],
    [[{ key: 'a"b' }], '$["a\\"b"]'],
    [[{ key: "" }], '$[""]'],
    [[{ key: "_ok$1" }], "$._ok$1"],
  ] as const)("%j ⇒ %s", (path, text) => expect(formatPath([...path])).toBe(text));
});
