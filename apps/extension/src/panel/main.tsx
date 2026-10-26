import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import { registerHooksUi } from "./components/hooks/register.ts";
import { resolveTabId } from "./tab-id.ts";
import { installTestSlots } from "./test-slots.tsx";

const root = document.getElementById("root");
if (root) {
  registerHooksUi();
  installTestSlots();
  document.documentElement.lang = chrome.i18n.getUILanguage();
  createRoot(root).render(
    <StrictMode>
      <App tabId={resolveTabId()} />
    </StrictMode>,
  );
}
