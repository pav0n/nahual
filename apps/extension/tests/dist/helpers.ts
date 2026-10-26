import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const DIST = path.join(appRoot, "dist");
export const DIST_TEST = path.join(appRoot, "dist-test");

export function listFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? listFiles(full) : [full];
  });
}

export const readJson = (file: string): unknown => JSON.parse(readFileSync(file, "utf8"));

export const filesContaining = (dir: string, needle: string) =>
  listFiles(dir).filter((f) => readFileSync(f, "utf8").includes(needle));
