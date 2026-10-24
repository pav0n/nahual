import { z } from "zod";
import { HeaderSchema } from "./common.ts";
import { LIMITS, utf8Bytes } from "./limits.ts";

// Diff de respuestas (005, data-model.md, research R7–R11).

export const ID_FIELDS = ["id", "_id", "uuid", "key"] as const;
export type IdField = (typeof ID_FIELDS)[number];

export const PathSegmentSchema = z.union([
  z.strictObject({ key: z.string().max(1024) }),
  z.strictObject({ index: z.int().min(0) }),
  z.strictObject({
    idField: z.enum(ID_FIELDS),
    id: z.union([z.string().max(1024), z.number()]),
  }),
]);
export type PathSegment = z.infer<typeof PathSegmentSchema>;
export const PathSchema = z.array(PathSegmentSchema).max(256);

export const COMPARABLE_UNAVAILABLE = ["binary", "tooLarge", "evicted", "none"] as const;

/** Un lado del diff: original capturada, un envío o la respuesta pegada (FR-022, FR-022a). */
export const ComparableResponseSchema = z.strictObject({
  origin: z.discriminatedUnion("kind", [
    z.strictObject({ kind: z.literal("original") }),
    z.strictObject({ kind: z.literal("send"), sendId: z.uuid() }),
    z.strictObject({ kind: z.literal("pasted") }),
  ]),
  status: z.int().min(0).max(999).nullable(),
  headers: z.array(HeaderSchema).max(500).nullable(),
  body: z.discriminatedUnion("kind", [
    z.strictObject({
      kind: z.literal("text"),
      text: z.string().refine((text) => utf8Bytes(text) <= LIMITS.bodyBytes),
      contentType: z.string().max(256).nullable(),
    }),
    z.strictObject({
      kind: z.literal("unavailable"),
      reason: z.enum(COMPARABLE_UNAVAILABLE),
      size: z.int().min(0).nullable(),
    }),
  ]),
});
export type ComparableResponse = z.infer<typeof ComparableResponseSchema>;

export const CHANGE_KINDS = ["added", "removed", "changed"] as const;
export type ChangeKind = (typeof CHANGE_KINDS)[number];

export const HeaderChangeSchema = z.strictObject({
  kind: z.enum(CHANGE_KINDS),
  name: z.string().max(1024),
  before: z.string().max(65_536).optional(),
  after: z.string().max(65_536).optional(),
  sensitive: z.boolean(),
});
export type HeaderChange = z.infer<typeof HeaderChangeSchema>;

export const JsonChangeSchema = z.strictObject({
  kind: z.enum(CHANGE_KINDS),
  path: PathSchema,
  before: z.unknown().optional(),
  after: z.unknown().optional(),
  sensitive: z.boolean(),
});
export type JsonChange = z.infer<typeof JsonChangeSchema>;

export const LineSchema = z.strictObject({
  op: z.enum(["+", "-", " "]),
  text: z.string(),
  sensitive: z.boolean(),
});
export type Line = z.infer<typeof LineSchema>;

export const HunkSchema = z.strictObject({
  beforeStart: z.int().min(1),
  afterStart: z.int().min(1),
  lines: z.array(LineSchema),
});
export type Hunk = z.infer<typeof HunkSchema>;

const Unavailable = z.strictObject({
  size: z.int().min(0).nullable(),
  reason: z.enum([...COMPARABLE_UNAVAILABLE, "text"]),
});

export const BodyDiffSchema = z.discriminatedUnion("mode", [
  z.strictObject({
    mode: z.literal("json"),
    changes: z.array(JsonChangeSchema).max(LIMITS.diffChangesMax),
    arrays: z
      .array(z.strictObject({ path: PathSchema, criterion: z.enum([...ID_FIELDS, "index"]) }))
      .max(LIMITS.diffChangesMax),
    truncated: z.boolean(),
  }),
  z.strictObject({
    mode: z.literal("lines"),
    hunks: z.array(HunkSchema),
    truncated: z.boolean(),
    beforeLines: z.int().min(0),
    afterLines: z.int().min(0),
  }),
  z.strictObject({ mode: z.literal("metadata"), before: Unavailable, after: Unavailable }),
  z.strictObject({ mode: z.literal("equal") }),
]);
export type BodyDiff = z.infer<typeof BodyDiffSchema>;

export const DIFF_NOTES = ["json_expected", "body_not_compared", "truncated"] as const;

export const DiffResultSchema = z.strictObject({
  status: z.strictObject({ before: z.int(), after: z.int() }).nullable(),
  headers: z.array(HeaderChangeSchema),
  body: BodyDiffSchema,
  ignored: z.strictObject({
    headers: z.array(HeaderChangeSchema),
    body: z.array(JsonChangeSchema),
  }),
  total: z.int().min(0),
  notes: z.array(z.enum(DIFF_NOTES)),
});
export type DiffResult = z.infer<typeof DiffResultSchema>;
