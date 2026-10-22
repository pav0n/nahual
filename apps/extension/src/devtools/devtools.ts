import { t } from "../shared/i18n.ts";

chrome.devtools.panels.create(t("panelTitle"), "", "src/panel/panel.html");
