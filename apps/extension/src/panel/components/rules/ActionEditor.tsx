import {
  FAIL_REASONS,
  LIMITS,
  type Action,
  type ActionKind,
  type FailReason,
} from "@nahual/domain";
import type { Issue } from "@nahual/protocol";
import { useState } from "react";
import { t } from "../../../shared/i18n.ts";
import { Field, issueAt } from "../common/Field.tsx";
import { MockForm, toMockAction, type MockFormValue } from "../queue/MockForm.tsx";
import type { RuleForm } from "./rule-form.ts";

const KINDS: ActionKind[] = ["pause", "mock", "fail", "delay", "log"];

const DEFAULT_MOCK: MockFormValue = {
  status: "200",
  headers: [{ name: "content-type", value: "application/json" }],
  body: "{}",
};

function defaultAction(kind: ActionKind): Action {
  switch (kind) {
    case "pause":
      return { kind: "pause" };
    case "mock":
      return toMockAction(DEFAULT_MOCK);
    case "fail":
      return { kind: "fail", errorReason: "failed" };
    case "delay":
      return { kind: "delay", ms: 3000 };
    case "log":
      return { kind: "log" };
    case "hook":
      // 006: el editor de código llega con T037; aquí solo la acción vacía.
      return {
        kind: "hook",
        source: "",
        imported: false,
        permissions: { changeDestination: false, readSensitive: false },
        check: { hash: "0", ok: false },
      };
  }
}

/** Acción de la regla (FR-019): Pausar, Mock, Fallar, Retrasar o Solo registrar. */
export function ActionEditor({
  form,
  setForm,
  issues,
}: {
  form: RuleForm;
  setForm(form: RuleForm): void;
  issues: Issue[];
}) {
  const action = form.action;
  const [mock, setMock] = useState<MockFormValue>(() =>
    action.kind === "mock"
      ? { status: String(action.status), headers: action.headers, body: action.body }
      : DEFAULT_MOCK,
  );
  const [delayText, setDelayText] = useState(() =>
    action.kind === "delay" ? String(action.ms) : "3000",
  );
  const set = (next: Action) => setForm({ ...form, action: next });

  return (
    <fieldset className="action-editor">
      <legend>{t("rule_action")}</legend>
      <Field label={t("action_kind")} hint={t(`action_kind_${action.kind}_hint`)}>
        {(props) => (
          <select
            {...props}
            value={action.kind}
            onChange={(e) => {
              const kind = e.target.value as ActionKind;
              if (kind === "mock") set(toMockAction(mock));
              else if (kind === "delay") set({ kind: "delay", ms: Number(delayText) });
              else set(defaultAction(kind));
            }}
          >
            {KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {t(`action_kind_${kind}`)}
              </option>
            ))}
          </select>
        )}
      </Field>

      {action.kind === "mock" ? (
        <MockForm
          value={mock}
          issues={issues}
          prefix="action."
          onChange={(value) => {
            setMock(value);
            set(toMockAction(value));
          }}
        />
      ) : null}

      {action.kind === "fail" ? (
        <Field label={t("action_fail_reason")} error={issueAt(issues, "action.errorReason")}>
          {(props) => (
            <select
              {...props}
              value={action.errorReason}
              onChange={(e) => set({ kind: "fail", errorReason: e.target.value as FailReason })}
            >
              {FAIL_REASONS.map((reason) => (
                <option key={reason} value={reason}>
                  {t(`fail_${reason}`)}
                </option>
              ))}
            </select>
          )}
        </Field>
      ) : null}

      {action.kind === "delay" ? (
        <Field
          label={t("action_delay_ms")}
          error={issueAt(issues, "action.ms")}
          hint={t("action_delay_hint", String(LIMITS.delayMsMax))}
        >
          {(props) => (
            <input
              {...props}
              inputMode="numeric"
              value={delayText}
              onChange={(e) => {
                setDelayText(e.target.value);
                set({ kind: "delay", ms: Number(e.target.value) });
              }}
            />
          )}
        </Field>
      ) : null}
    </fieldset>
  );
}
