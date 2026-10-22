import { t } from "../shared/i18n.ts";

export function App({ tabId }: { tabId: number | null }) {
  return (
    <main>
      <h1>{t("panelTitle")}</h1>
      {tabId === null ? null : null}
    </main>
  );
}
