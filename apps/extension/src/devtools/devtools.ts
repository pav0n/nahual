import { t } from "../shared/i18n.ts";

chrome.devtools.panels.create(t("panelTitle"), "icons/panel-16.png", "src/panel/panel.html");
