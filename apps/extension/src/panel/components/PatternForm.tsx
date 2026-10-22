import {
  InterceptionPatternSchema,
  MAX_PATTERNS,
  MAX_PAUSE_TIMEOUT_SECONDS,
  MIN_PAUSE_TIMEOUT_SECONDS,
  type InterceptionPattern,
  type Stage,
} from "@nahual/protocol";
import { useId, useState, type FormEvent } from "react";
import { t } from "../../shared/i18n.ts";

interface Props {
  patterns: InterceptionPattern[];
  pauseTimeoutSeconds: number;
  disabled: boolean;
  onPatternsChange(patterns: InterceptionPattern[]): void;
  onTimeoutChange(seconds: number): void;
}

export function PatternForm(props: Props) {
  const { patterns, pauseTimeoutSeconds, disabled } = props;
  const id = useId();
  const [urlPattern, setUrlPattern] = useState("");
  const [stage, setStage] = useState<Stage>("request");
  const [patternError, setPatternError] = useState<string | null>(null);
  // `null` muestra el valor vigente del SW; un texto es lo que el usuario está escribiendo.
  const [timeoutDraft, setTimeoutDraft] = useState<string | null>(null);
  const [timeoutError, setTimeoutError] = useState<string | null>(null);
  const timeout = timeoutDraft ?? String(pauseTimeoutSeconds);

  const addPattern = (event: FormEvent) => {
    event.preventDefault();
    const candidate = { urlPattern: urlPattern.trim(), stage };
    if (
      !InterceptionPatternSchema.safeParse(candidate).success ||
      patterns.length >= MAX_PATTERNS
    ) {
      setPatternError(t("error_pattern_invalid"));
      return;
    }
    setPatternError(null);
    setUrlPattern("");
    props.onPatternsChange([...patterns, candidate]);
  };

  const applyTimeout = (event: FormEvent) => {
    event.preventDefault();
    const seconds = Number(timeout);
    if (
      !Number.isInteger(seconds) ||
      seconds < MIN_PAUSE_TIMEOUT_SECONDS ||
      seconds > MAX_PAUSE_TIMEOUT_SECONDS
    ) {
      // Se conserva el valor anterior (edge case de la spec).
      setTimeoutError(t("error_timeout_out_of_range"));
      setTimeoutDraft(null);
      return;
    }
    setTimeoutError(null);
    setTimeoutDraft(null);
    props.onTimeoutChange(seconds);
  };

  return (
    <section aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`}>{t("section_patterns")}</h2>

      {patterns.length === 0 ? (
        <p className="muted">{t("empty_no_patterns")}</p>
      ) : (
        <ul className="plain">
          {patterns.map((p) => (
            <li key={`${p.stage}:${p.urlPattern}`} className="row">
              <code className="grow">{p.urlPattern}</code>
              <span>{t(`stage_${p.stage}`)}</span>
              <button
                type="button"
                disabled={disabled}
                onClick={() => props.onPatternsChange(patterns.filter((q) => q !== p))}
              >
                {t("action_remove_pattern", p.urlPattern)}
              </button>
            </li>
          ))}
        </ul>
      )}

      <form className="row" onSubmit={addPattern} noValidate>
        <label className="grow">
          {t("label_url_pattern")}
          <input
            value={urlPattern}
            onChange={(e) => setUrlPattern(e.target.value)}
            disabled={disabled}
            aria-invalid={patternError !== null}
            aria-describedby={patternError ? `${id}-pattern-error` : undefined}
            spellCheck={false}
          />
        </label>
        <label>
          {t("label_stage")}
          <select
            value={stage}
            onChange={(e) => setStage(e.target.value as Stage)}
            disabled={disabled}
          >
            <option value="request">{t("stage_request")}</option>
            <option value="response">{t("stage_response")}</option>
          </select>
        </label>
        <button type="submit" disabled={disabled}>
          {t("action_add_pattern")}
        </button>
      </form>
      {patternError ? (
        <p id={`${id}-pattern-error`} role="alert" className="alert">
          {patternError}
        </p>
      ) : null}

      <form className="row" onSubmit={applyTimeout} noValidate>
        <label className="grow">
          {t("label_timeout_seconds")}
          <input
            inputMode="numeric"
            value={timeout}
            onChange={(e) => setTimeoutDraft(e.target.value)}
            aria-invalid={timeoutError !== null}
            aria-describedby={timeoutError ? `${id}-timeout-error` : undefined}
          />
        </label>
        <button type="submit">{t("action_apply_timeout")}</button>
      </form>
      {timeoutError ? (
        <p id={`${id}-timeout-error`} role="alert" className="alert">
          {timeoutError}
        </p>
      ) : null}
    </section>
  );
}
