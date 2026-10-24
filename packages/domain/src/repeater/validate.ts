import { RepeaterRequestSchema, type RepeaterRequest } from "../schemas/repeater.ts";
import { toIssues, type Validation } from "../validate.ts";

/** Validación del editor del repeater (FR-007): issues por campo con su clave i18n, sin valores. */
export function validateRepeaterRequest(input: unknown): Validation<RepeaterRequest> {
  const result = RepeaterRequestSchema.safeParse(input);
  return result.success
    ? { ok: true, value: result.data }
    : { ok: false, issues: toIssues(result.error) };
}
