import { useCallback, useRef, useState } from "react";
import { getCaretOffset } from "./caret";
import type { Doc } from "./types";

export type Focus = { id: string; offset: number | "end" } | null;
type Snapshot = { doc: Doc; focus: Focus };

const MAX_HISTORY = 200;
const TYPING_WINDOW = 1000;

export function currentFocus(): Focus {
  const el = (document.activeElement as HTMLElement | null)?.closest<HTMLElement>("[data-editable]");
  return el?.dataset.blockId ? { id: el.dataset.blockId, offset: getCaretOffset(el) } : null;
}

/**
 * Document state with its own undo history. contentEditable's native undo can't survive
 * structural edits (split, merge, reorder), so every change goes through `commit`.
 */
export function useDocument(initial: () => Doc) {
  const [doc, setDoc] = useState(initial);
  const docRef = useRef(doc);
  const past = useRef<Snapshot[]>([]);
  const future = useRef<Snapshot[]>([]);
  const typing = useRef<{ key: string; t: number } | null>(null);
  const pendingFocus = useRef<Focus>(null);
  const [, rerender] = useState(0);

  const apply = (next: Doc) => {
    docRef.current = next;
    setDoc(next);
  };

  /** `typingIn` coalesces consecutive keystrokes in the same block into one undo step. */
  const commit = useCallback((update: Doc | ((d: Doc) => Doc), opts: { focus?: Focus; typingIn?: string } = {}) => {
    const cur = docRef.current;
    const next = typeof update === "function" ? update(cur) : update;
    if (next === cur) return;
    const now = Date.now();
    const coalesce = opts.typingIn && typing.current?.key === opts.typingIn && now - typing.current.t < TYPING_WINDOW;
    if (!coalesce) {
      past.current.push({ doc: cur, focus: currentFocus() });
      if (past.current.length > MAX_HISTORY) past.current.shift();
      future.current = [];
    }
    typing.current = opts.typingIn ? { key: opts.typingIn, t: now } : null;
    if (opts.focus) pendingFocus.current = opts.focus;
    apply(next);
  }, []);

  const travel = (from: typeof past, to: typeof future) => {
    const snap = from.current.pop();
    if (!snap) return;
    to.current.push({ doc: docRef.current, focus: currentFocus() });
    typing.current = null;
    pendingFocus.current = snap.focus;
    apply(snap.doc);
    rerender((n) => n + 1);
  };

  const undo = useCallback(() => travel(past, future), []);
  const redo = useCallback(() => travel(future, past), []);

  return {
    doc,
    docRef,
    commit,
    undo,
    redo,
    pendingFocus,
    canUndo: past.current.length > 0,
    canRedo: future.current.length > 0,
  };
}
