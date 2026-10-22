import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import { resolveTabId } from "./tab-id.ts";

const root = document.getElementById("root");
if (root) {
  document.documentElement.lang = chrome.i18n.getUILanguage();
  createRoot(root).render(
    <StrictMode>
      <App tabId={resolveTabId()} />
    </StrictMode>,
  );
}
