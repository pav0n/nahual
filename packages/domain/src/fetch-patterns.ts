/** Patrón de `Fetch.enable` (CDP `Fetch.RequestPattern`). */
export interface FetchPattern {
  urlPattern: string;
  requestStage: "Request" | "Response";
  resourceType?: string;
}
