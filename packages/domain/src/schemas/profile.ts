import { z } from "zod";
import { LIMITS } from "./limits.ts";
import { SiteSchema } from "./rule.ts";

/** Perfil de reglas (007, data-model, FR-019): pertenece a un sitio, como las reglas de 002. */
export const ProfileSchema = z.strictObject({
  id: z.uuid(),
  site: SiteSchema,
  name: z
    .string()
    .trim()
    .min(1, { error: "profile_error_required" })
    .max(LIMITS.profileNameMax, { error: "profile_error_too_long" }),
  createdAt: z.number(),
  updatedAt: z.number(),
});
export type Profile = z.infer<typeof ProfileSchema>;

/**
 * `nahual.profiles.v1` (contracts/storage.md): perfiles y el último perfil activado en cada
 * sitio, que se restaura al abrir el panel en una pestaña de ese sitio (FR-022).
 */
export const ProfilesStateSchema = z.strictObject({
  version: z.literal(1),
  profiles: z.array(ProfileSchema),
  lastActive: z.record(SiteSchema, z.uuid()),
});
export type ProfilesState = z.infer<typeof ProfilesStateSchema>;

/** ¿El nombre está libre en el sitio? Sin distinguir mayúsculas; `exceptId` es el propio perfil. */
export function uniqueProfileName(
  profiles: readonly Profile[],
  site: string,
  name: string,
  exceptId?: string,
): boolean {
  const wanted = name.trim().toLocaleLowerCase();
  return !profiles.some(
    (p) => p.site === site && p.id !== exceptId && p.name.toLocaleLowerCase() === wanted,
  );
}
