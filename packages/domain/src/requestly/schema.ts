import { z } from "zod";

// Export de reglas de Requestly (007, contracts/requestly-import.md): un array JSON de registros
// con `objectType`. Schemas laxos: los campos que Nahual no usa se ignoran. Requestly es solo una
// referencia de formato; no se reutiliza su código (AGPLv3, decisión de 001).

export const RequestlySourceSchema = z.looseObject({
  key: z.string(),
  operator: z.string(),
  value: z.string(),
  filters: z.union([z.array(z.unknown()), z.record(z.string(), z.unknown())]).optional(),
});
export type RequestlySource = z.infer<typeof RequestlySourceSchema>;

export const RequestlyModificationSchema = z.looseObject({
  header: z.string(),
  type: z.string(),
  value: z.string().optional(),
});
export type RequestlyModification = z.infer<typeof RequestlyModificationSchema>;

export const RequestlyPairSchema = z.looseObject({
  source: RequestlySourceSchema.optional(),
  destinationType: z.string().optional(),
  destination: z.string().optional(),
  modifications: z
    .union([
      z.array(RequestlyModificationSchema),
      z.looseObject({
        Request: z.array(RequestlyModificationSchema).optional(),
        Response: z.array(RequestlyModificationSchema).optional(),
      }),
    ])
    .optional(),
  response: z
    .looseObject({
      type: z.string(),
      value: z.string(),
      statusCode: z.union([z.string(), z.number()]).optional(),
      serveWithoutRequest: z.boolean().optional(),
    })
    .optional(),
});
export type RequestlyPair = z.infer<typeof RequestlyPairSchema>;

export const RequestlyRuleSchema = z.looseObject({
  objectType: z.literal("rule"),
  id: z.string(),
  name: z.string(),
  ruleType: z.string(),
  groupId: z.string().nullable().optional(),
  pairs: z.array(z.unknown()),
});
export type RequestlyRule = z.infer<typeof RequestlyRuleSchema>;

export const RequestlyGroupSchema = z.looseObject({
  objectType: z.literal("group"),
  id: z.string(),
  name: z.string(),
});

export const RequestlyExportSchema = z.array(z.looseObject({ objectType: z.string() }));
