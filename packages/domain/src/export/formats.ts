/** Formatos de exportación de 007 (data-model "ExportFormat"), en el orden de la vista previa. */
export const EXPORT_FORMATS = ["curl", "fetch", "vitest", "msw", "zod", "postman"] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];
