import type { ReactNode } from "react";

/** Estado vacío: qué pasa y qué hacer (principio III). */
export function EmptyState({
  title,
  children,
  action,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state" tabIndex={-1}>
      <p className="empty-title">{title}</p>
      {children ? <div className="muted">{children}</div> : null}
      {action ? <div className="row">{action}</div> : null}
    </div>
  );
}
