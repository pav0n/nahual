import type { Header } from "@nahual/domain";
import type { Issue } from "@nahual/protocol";
import { t } from "../../../shared/i18n.ts";
import { Field, issueAt } from "../common/Field.tsx";
import { BodyEditor } from "./BodyEditor.tsx";
import { HeadersEditor } from "./HeadersEditor.tsx";

export interface MockFormValue {
  status: string;
  headers: Header[];
  body: string;
}

/** Status, headers y body de un mock (FR-019); lo usan la cola y el editor de acciones. */
export function MockForm({
  value,
  issues,
  prefix,
  onChange,
}: {
  value: MockFormValue;
  issues: Issue[];
  /** Prefijo de las rutas de `issues` (`""` en la cola, `"action."` en una regla). */
  prefix: string;
  onChange(value: MockFormValue): void;
}) {
  const json = value.headers.some(
    (h) => h.name.toLowerCase() === "content-type" && h.value.includes("json"),
  );
  return (
    <div className="mock-form">
      <Field label={t("mock_status")} error={issueAt(issues, `${prefix}status`)}>
        {(props) => (
          <input
            {...props}
            inputMode="numeric"
            value={value.status}
            onChange={(e) => onChange({ ...value, status: e.target.value })}
          />
        )}
      </Field>
      <HeadersEditor
        legend={t("mock_headers")}
        headers={value.headers}
        onChange={(headers) => onChange({ ...value, headers })}
      />
      <BodyEditor
        label={t("mock_body")}
        value={value.body}
        json={json}
        onChange={(body) => onChange({ ...value, body })}
      />
      {issueAt(issues, `${prefix}body`) ? (
        <span className="field-error">{t(issueAt(issues, `${prefix}body`) ?? "")}</span>
      ) : null}
    </div>
  );
}

export const toMockAction = (value: MockFormValue) => ({
  kind: "mock" as const,
  status: Number(value.status),
  headers: value.headers.filter((h) => h.name !== ""),
  body: value.body,
  bodyEncoding: "text" as const,
});
