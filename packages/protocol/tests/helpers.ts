export const UUID = "3f1c2b4a-8d9e-4f60-a1b2-c3d4e5f60718";
export const UUID2 = "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d";

export const envelope = (type: string, payload: unknown, extra: Record<string, unknown> = {}) => ({
  v: 4,
  id: UUID,
  type,
  payload,
  ...extra,
});
