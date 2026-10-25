import { useState } from "react";
import { t } from "../../../shared/i18n.ts";
import { usePanelStore } from "../../store/index.ts";
import { Tabs } from "../common/Tabs.tsx";

export const REPEATER_TABS_PREFIX = "repeater";

/**
 * Pestañas del repeater (FR-020): elegir, renombrar, duplicar y cerrar la activa; al cerrar, un
 * aviso ofrece "Deshacer" durante 10 s y la devuelve con su historial.
 */
export function RepeaterTabs() {
  const tabs = usePanelStore((s) => s.repeaterTabs);
  const active = usePanelStore((s) => s.activeRepeaterTab);
  const [renaming, setRenaming] = useState<string | null>(null);
  const store = usePanelStore.getState;
  const current = tabs.find((tab) => tab.id === active) ?? null;

  const create = () => {
    if (!store().newRepeaterTab(t("repeater_new_tab")))
      store().pushToast({ messageKey: "repeater_tabs_full" });
  };
  const duplicate = () => {
    if (!current) return;
    if (!store().duplicateRepeaterTab(current.id, t("repeater_tab_copy", current.name)))
      store().pushToast({ messageKey: "repeater_tabs_full" });
  };
  const close = () => {
    if (!current) return;
    store().closeRepeaterTab(current.id);
    store().pushToast(
      {
        messageKey: "repeater_tab_closed",
        params: [current.name],
        actionKey: "action_undo",
        onAction: () => usePanelStore.getState().restoreRepeaterTab(),
      },
      10_000,
    );
  };

  return (
    <div className="repeater-tabbar">
      {tabs.length > 0 && active ? (
        <Tabs
          idPrefix={REPEATER_TABS_PREFIX}
          label={t("repeater_tabs_label")}
          tabs={tabs.map((tab) => ({ id: tab.id, label: tab.name }))}
          selected={active}
          onSelect={(id) => store().selectRepeaterTab(id)}
        />
      ) : null}
      <div className="row repeater-tab-actions">
        <button type="button" onClick={create}>
          {t("repeater_new_tab")}
        </button>
        {current ? (
          <>
            {renaming === current.id ? (
              <form
                className="row"
                onSubmit={(event) => {
                  event.preventDefault();
                  const input = new FormData(event.currentTarget).get("name");
                  store().renameRepeaterTab(current.id, String(input ?? ""));
                  setRenaming(null);
                }}
              >
                <input
                  name="name"
                  aria-label={t("repeater_tab_name")}
                  defaultValue={current.name}
                  maxLength={60}
                  autoFocus
                  onKeyDown={(event) => {
                    if (event.key === "Escape") {
                      event.stopPropagation();
                      setRenaming(null);
                    }
                  }}
                />
                <button type="submit">{t("repeater_tab_rename_save")}</button>
              </form>
            ) : (
              <button type="button" onClick={() => setRenaming(current.id)}>
                {t("repeater_tab_rename")}
              </button>
            )}
            <button type="button" onClick={duplicate}>
              {t("repeater_tab_duplicate")}
            </button>
            <button type="button" onClick={close}>
              {t("repeater_tab_close")}
            </button>
          </>
        ) : null}
      </div>
    </div>
  );
}
