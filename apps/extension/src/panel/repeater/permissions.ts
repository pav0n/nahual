/**
 * Acceso por origen para el contexto limpio (005, FR-011a, research R5). `request` resuelve al
 * instante sin diálogo si el origen ya está concedido; si no, Chrome pregunta al dev. Se llama
 * en el clic de "Enviar", que es el gesto que Chrome exige. El build de pruebas puede
 * sustituirlo (Playwright no puede contestar el diálogo, research X2).
 */
export const originAccess = {
  request: (origin: string): Promise<boolean> =>
    chrome.permissions.request({ origins: [`${origin}/*`] }),
  list: async (): Promise<string[]> =>
    ((await chrome.permissions.getAll()).origins ?? [])
      .filter((pattern) => /^https?:\/\/[^*]+\/\*$/.test(pattern))
      .map((pattern) => pattern.slice(0, -2)),
  remove: (origin: string): Promise<boolean> =>
    chrome.permissions.remove({ origins: [`${origin}/*`] }),
};
