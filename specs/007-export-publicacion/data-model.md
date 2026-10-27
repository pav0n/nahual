# Data Model: Exportar al código, perfiles y publicación (007)

Tipos de `packages/domain` (puro, sin `chrome.*`). Los schemas Zod son la fuente; los tipos
salen con `z.infer`. Los límites viven en `LIMITS`.

## Límites (`LIMITS`, domain)

| Clave | Valor | Origen |
|---|---|---|
| `exportBatchMax` | 50 | R2 |
| `exportInlineBodyBytes` | 1,048,576 (1 MB) | R2, Edge Cases |
| `zodDepthMax` | 10 | FR-015, R6 |
| `profilesPerSiteMax` | 50 | FR-019 |
| `profileNameMax` | 60 | FR-019 |
| `profilesPerRuleMax` | 20 | R13 |
| `importFileBytesMax` | 10,485,760 (10 MB) | FR-029, Assumptions |
| `importUndoMs` | 10,000 (= `RESTORE_MS`) | clarificación |
| `rulesMax`, `hookSourceBytesMax`, `hookTotalBytesMax`, `productionOriginsMax`, `bodyBytes` | de 002, 003 y 006 | FR-029 suma lo importado a lo existente |

## Regla (ampliación de `schemas/rule.ts`)

| Campo nuevo | Tipo | Reglas |
|---|---|---|
| `profileIds` | `string[]` (uuid), ≤ `profilesPerRuleMax`, `.default([])` | En `DRAFT_SHAPE` (el editor lo edita); cada id debe existir en un perfil del mismo sitio (el SW lo comprueba al guardar) |
| `importedFrom` | `"config" \| "requestly"`, opcional | Lo pone el SW al importar; el dev no lo cambia; la lista muestra "importado" / "importado de Requestly". Distinto de `HookAction.imported` (booleano, 006) |

Misma clave `nahual.rules.v1` y misma versión: los campos son opcionales con default.

## `Profile` (`schemas/profile.ts`)

| Campo | Tipo | Reglas |
|---|---|---|
| `id` | uuid | |
| `site` | `SiteSchema` | mismo criterio que las reglas (FR-019) |
| `name` | string 1–`profileNameMax`, recortado | único por sitio sin distinguir mayúsculas (`profile_error_duplicate`) |
| `createdAt`, `updatedAt` | number | |

**`ProfilesState`** (`nahual.profiles.v1`): `{ version: 1, profiles: Profile[], lastActive:
Record<site, profileId> }`. `lastActive` se limpia de ids que ya no existen al leer y al borrar. Duplicar un perfil crea
el nuevo y copia su pertenencia en todas sus reglas en una sola escritura de
`nahual.profiles.v1` + `nahual.rules.v1`.

**Perfil activo por pestaña** (memoria del SW): `activeProfileId: string | null` por `tabId`;
`null` = "Todas las reglas". Transiciones: `hello` ⇒ `lastActive[site] ?? null`; navegación a otro
sitio ⇒ `lastActive[nuevoSitio] ?? null`; `setActiveProfile` ⇒ el valor y `lastActive[site]`;
borrar el perfil activo ⇒ `null` en cada pestaña que lo tenía (evento `state` con aviso).

**Evaluación**: `SelectContext.activeProfileId`; con un valor no nulo, `selectChain` solo
considera reglas con `profileIds.includes(activeProfileId)`.

## `ExportSource` (`export/source.ts`)

Entrada común de los exportadores, construida por el panel.

| Campo | Tipo | Notas |
|---|---|---|
| `request.method`, `request.url` | string | URL completa |
| `request.headers` | `{ name, value }[]` | ya filtrados los que pone el navegador (R4) |
| `request.body` | `ExportBody` | |
| `response` | `{ status, headers, body: ExportBody, mimeType } \| null` | `null` si no hubo respuesta |
| `origin` | `{ kind: "traffic", exchangeId } \| { kind: "repeater", tabId, sendId? }` | para el nombre del archivo y los avisos |
| `capturedAt` | number | solo para comentarios de Postman/MSW; no afecta al código generado |

`ExportBody`: `{ kind: "text", text, contentType }` · `{ kind: "form", fields: { name, value }[] }`
· `{ kind: "multipart", parts: ({ name, value } | { name, filename, omitted: true })[] }` ·
`{ kind: "omitted", reason: "binary" | "tooLarge" | "unavailable", size }` · `{ kind: "none" }`.

## Redacción (`sensitive.ts`)

`redactExportSource(source) → { source, redacted: RedactedSite[] }` con
`RedactedSite = { where: "header" | "query" | "body", name: string, envVar: string,
postmanVar: string }`. Los exportadores reciben el `source` redactado y la lista; con "Incluir
valores sensibles" reciben el original y `redacted = []`.

## `ExportFormat` y resultado

| `ExportFormat` | Extensión | Necesita respuesta | Lote |
|---|---|---|---|
| `curl` | `.sh` | no | no |
| `fetch` | `.ts` | no | no |
| `vitest` | `.contract.test.ts` | sí (para el schema; sin ella verifica solo status) | no |
| `msw` | `.ts` (`handlers.ts` en lote) | sí | sí |
| `zod` | `.ts` | sí, body JSON | sí (mismo endpoint) |
| `postman` | `.postman_collection.json` | opcional (ejemplo) | sí |

`ExportResult = { code: string, fileName: string, redacted: RedactedSite[], omitted:
{ exchangeId, reasonKey }[], merged: { endpoint, count }[] }`. Determinista: mismo `source` y
opciones ⇒ mismo `code` (FR-017).

## Schema inferido (`export/zod.ts`)

`InferredType` = `{ kind: "object", fields: Map<string, { type, optional, nullable }> }` ·
`{ kind: "array", items: InferredType }` · `{ kind: "string", format?: "datetime" }` ·
`{ kind: "number", int: boolean }` · `{ kind: "boolean" }` · `{ kind: "null" }` ·
`{ kind: "union", members: InferredType[] }` · `{ kind: "unknown" }`. `merge(a, b)` es
conmutativa y asociativa; la profundidad se corta en `zodDepthMax`.

## Configuración portable (`portable/schema.ts`)

Ver [contracts/portable-config.md](./contracts/portable-config.md). Tipos: `PortableConfigV1`,
`PortableRule` (= `RuleDraft` + `id` + `order` + `profileIds`; acción `hook` sin `permissions`
ni `check`), `PortableProfile` (`id`, `name`). `ImportPayload` (lo que viaja en `importConfig`):
`{ config: PortableConfigV1, source: "config" | "requestly", hookChecks: Record<ruleId,
{ hash, ok }> }`. `ImportPreview` (panel): `{ sites: { site, rules: n, profiles: n, hooks: n,
renamedProfiles: string[] }[], productionOrigins: { new: string[], existing: string[] },
redactedRules: string[], unsupported: { name, reasonKey }[] }`.

**Instantánea de deshacer** (memoria del SW): `{ importId, expiresAt, rules, profiles,
productionOrigins }` tal como estaban antes; una sola a la vez (una importación nueva descarta la
anterior).

## Conversión de Requestly (`requestly/`)

`RequestlyExport = RequestlyRecord[]`, `RequestlyRecord = RequestlyRule | RequestlyGroup`
(schemas Zod **laxos**: `z.looseObject` con los campos que se usan; lo desconocido se ignora).
`convertRequestly(records, site) → { config: PortableConfigV1, unsupported: { name, reasonKey }[] }`.
Motivos (`requestly_unsupported_*`): `rule_type`, `response_code`, `redirect_destination`,
`regex_invalid`, `regex_too_long`, `filter`, `empty_pairs`, `source_key`, `source_operator`.

## Preferencia de interfaz (`UiPrefs`)

`exportFormat: ExportFormat` (default `curl`), con `catch` al default como el resto de campos.

## Release (`scripts/build-sbom.mjs`)

SBOM CycloneDX 1.6 JSON: `bomFormat`, `specVersion`, `serialNumber` derivado del SHA-256 del zip
(`urn:uuid:` con los primeros 128 bits), `metadata.component` (`@nahual/extension`, versión,
`purl`), `components[]` (dependencias de producción resueltas por `pnpm list --prod --json
--depth Infinity`: `name`, `version`, `purl pkg:npm/...`, `licenses`, `hashes` si el lockfile los
trae) ordenados por `purl`. Sin `metadata.timestamp` (determinismo).
