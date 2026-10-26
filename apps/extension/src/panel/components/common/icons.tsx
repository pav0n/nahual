import type { ReactNode } from "react";

/**
 * Iconos de línea como los de DevTools (004, FR-005, research R1/D1): caja de 20 px y trazo de
 * 1,5 px en `currentColor`. Siempre decorativos: el nombre accesible lo pone el control.
 */
export type IconName =
  | "pause"
  | "play"
  | "settings"
  | "help"
  | "close"
  | "search"
  | "clear"
  | "regex"
  | "chevron"
  | "more"
  | "attached"
  | "detached"
  | "attaching"
  | "conflict"
  | "relaxed"
  | "blocked"
  | "paused"
  | "warning"
  | "plus"
  | "edit"
  | "copy"
  | "error"
  | "download"
  | "export"
  | "profile";

const PATHS: Record<IconName, ReactNode> = {
  pause: <path d="M7.5 5v10M12.5 5v10" />,
  play: <path d="M7 5l8 5-8 5z" />,
  settings: (
    <>
      <circle cx="10" cy="10" r="2.5" />
      <path d="M10 3v2M10 15v2M3 10h2M15 10h2M5 5l1.5 1.5M13.5 13.5L15 15M5 15l1.5-1.5M13.5 6.5L15 5" />
    </>
  ),
  help: (
    <>
      <circle cx="10" cy="10" r="7" />
      <path d="M8 8a2 2 0 1 1 3 1.7c-.6.4-1 .8-1 1.5V12M10 14.5v.5" />
    </>
  ),
  close: <path d="M5.5 5.5l9 9M14.5 5.5l-9 9" />,
  search: (
    <>
      <circle cx="9" cy="9" r="4.5" />
      <path d="M12.5 12.5L16 16" />
    </>
  ),
  clear: (
    <>
      <circle cx="10" cy="10" r="6.5" />
      <path d="M5.5 14.5l9-9" />
    </>
  ),
  regex: <path d="M13 4v6M10.4 5.5l5.2 3M10.4 8.5l5.2-3M5 14.5h2.5v2.5H5z" />,
  chevron: <path d="M6 8l4 4 4-4" />,
  more: <path d="M10 5v.5M10 10v.5M10 15v.5" />,
  attached: <circle cx="10" cy="10" r="4" fill="currentColor" />,
  detached: <circle cx="10" cy="10" r="4" />,
  attaching: <path d="M10 5a5 5 0 1 1-5 5" />,
  conflict: <path d="M10 4l6.5 11.5h-13zM10 9v3M10 14v.5" />,
  relaxed: <path d="M4 8h11l-3-3M16 12H5l3 3" />,
  blocked: (
    <>
      <circle cx="10" cy="10" r="6" />
      <path d="M5.8 14.2l8.4-8.4" />
    </>
  ),
  paused: (
    <>
      <circle cx="10" cy="10" r="6.5" />
      <path d="M8.5 7.5v5M11.5 7.5v5" />
    </>
  ),
  warning: <path d="M10 4l6.5 11.5h-13zM10 9v3M10 14v.5" />,
  plus: <path d="M10 4.5v11M4.5 10h11" />,
  edit: <path d="M4.5 15.5l.8-3.3 7.4-7.4 2.5 2.5-7.4 7.4zM11.2 6.3l2.5 2.5" />,
  download: <path d="M10 4v8.5M6.5 9l3.5 3.5L13.5 9M5 15.5h10" />,
  export: <path d="M10 13V4.5M6.5 8L10 4.5 13.5 8M5 15.5h10" />,
  // 007: perfil de reglas, capas apiladas (un grupo de reglas que se activa entero).
  profile: <path d="M10 4l6 3-6 3-6-3zM4 10l6 3 6-3M4 13l6 3 6-3" />,
  error: (
    <>
      <circle cx="10" cy="10" r="6.5" />
      <path d="M7.75 7.75l4.5 4.5M12.25 7.75l-4.5 4.5" />
    </>
  ),
  copy: (
    <>
      <rect x="7.5" y="7.5" width="8" height="8" rx="1.5" />
      <path d="M12.5 4.5h-6.5a1.5 1.5 0 0 0-1.5 1.5v6.5" />
    </>
  ),
};

export function Icon({ name }: { name: IconName }) {
  return (
    <svg
      className="icon"
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[name]}
    </svg>
  );
}
