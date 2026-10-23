import type { Issue, SessionState } from "@nahual/protocol";
import type { SliceCreator } from "./types.ts";

export interface Notice {
  id: number;
  messageKey: string;
  params?: string[];
}

export interface CommandError {
  messageKey: string;
  issues: Issue[];
}

export interface ConnectionSlice {
  session: SessionState | null;
  lastError: CommandError | null;
  notices: Notice[];
  setSession(session: SessionState): void;
  setError(error: CommandError | null): void;
  pushNotice(messageKey: string, params?: string[]): void;
  dismissNotice(id: number): void;
}

let noticeSeq = 0;

export const createConnectionSlice: SliceCreator<ConnectionSlice> = (set) => ({
  session: null,
  lastError: null,
  notices: [],
  setSession: (session) =>
    set((s) => {
      s.session = session;
    }),
  setError: (error) =>
    set((s) => {
      s.lastError = error;
    }),
  pushNotice: (messageKey, params) =>
    set((s) => {
      // Un aviso repetido no se acumula.
      if (s.notices.some((n) => n.messageKey === messageKey)) return;
      s.notices.push(
        params ? { id: ++noticeSeq, messageKey, params } : { id: ++noticeSeq, messageKey },
      );
    }),
  dismissNotice: (id) =>
    set((s) => {
      s.notices = s.notices.filter((n) => n.id !== id);
    }),
});
