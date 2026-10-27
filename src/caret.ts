/** Caret helpers that work in plain-text offsets, so positions survive re-renders and undo. */

export function getCaretOffset(el: HTMLElement): number {
  const sel = window.getSelection();
  if (!sel?.rangeCount || !el.contains(sel.focusNode)) return 0;
  const pre = document.createRange();
  pre.selectNodeContents(el);
  pre.setEnd(sel.focusNode!, sel.focusOffset);
  return pre.toString().length;
}

export function setCaretOffset(el: HTMLElement, offset: number) {
  const sel = window.getSelection();
  if (!sel) return;
  const range = document.createRange();
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let remaining = offset;
  let node: Node | null;
  while ((node = walker.nextNode())) {
    const len = node.textContent!.length;
    if (remaining <= len) {
      range.setStart(node, remaining);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
      return;
    }
    remaining -= len;
  }
  range.selectNodeContents(el);
  range.collapse(offset <= 0);
  sel.removeAllRanges();
  sel.addRange(range);
}

export function textLength(el: HTMLElement) {
  return el.textContent?.length ?? 0;
}

export function selectionCollapsedIn(el: HTMLElement) {
  const sel = window.getSelection();
  return !!sel?.rangeCount && sel.isCollapsed && el.contains(sel.anchorNode);
}

export const isAtStart = (el: HTMLElement) => selectionCollapsedIn(el) && getCaretOffset(el) === 0;
export const isAtEnd = (el: HTMLElement) => selectionCollapsedIn(el) && getCaretOffset(el) === textLength(el);

function serialize(frag: DocumentFragment) {
  const div = document.createElement("div");
  div.appendChild(frag);
  return div.innerHTML;
}

/** Splits the block's HTML at the caret (deleting any selection first), keeping inline formatting on both sides. */
export function splitAtCaret(el: HTMLElement): [string, string] {
  const sel = window.getSelection()!;
  const range = sel.getRangeAt(0);
  if (!range.collapsed) range.deleteContents();
  const before = document.createRange();
  before.selectNodeContents(el);
  before.setEnd(range.startContainer, range.startOffset);
  const after = document.createRange();
  after.selectNodeContents(el);
  after.setStart(range.startContainer, range.startOffset);
  return [serialize(before.cloneContents()), serialize(after.cloneContents())];
}

/** Is the caret on the first (or last) visual line of the element? */
export function caretOnEdgeLine(el: HTMLElement, edge: "first" | "last") {
  const sel = window.getSelection();
  if (!sel?.rangeCount || !sel.isCollapsed) return false;
  const rect = caretRect();
  if (!rect) return true;
  const box = el.getBoundingClientRect();
  const line = parseFloat(getComputedStyle(el).lineHeight) || 24;
  return edge === "first" ? rect.top - box.top < line * 0.8 : box.bottom - rect.bottom < line * 0.8;
}

export function caretRect(): DOMRect | null {
  const sel = window.getSelection();
  if (!sel?.rangeCount) return null;
  const range = sel.getRangeAt(0).cloneRange();
  range.collapse(false);
  const rects = range.getClientRects();
  if (rects.length) return rects[rects.length - 1];
  // Empty line: measure the containing element instead
  const node = range.startContainer;
  const el = (node.nodeType === 1 ? node : node.parentElement) as HTMLElement | null;
  return el?.getBoundingClientRect() ?? null;
}

/** Puts the caret in `el` as close as possible to screen x, on its first or last line. */
export function placeCaretAtX(el: HTMLElement, x: number, edge: "first" | "last") {
  const box = el.getBoundingClientRect();
  const line = parseFloat(getComputedStyle(el).lineHeight) || 24;
  const y = edge === "first" ? box.top + line / 2 : box.bottom - line / 2;
  const doc = document as Document & { caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null };
  const sel = window.getSelection()!;
  const range = document.createRange();
  const pos = doc.caretPositionFromPoint?.(x, y);
  if (pos && el.contains(pos.offsetNode)) {
    range.setStart(pos.offsetNode, pos.offset);
  } else {
    const r = document.caretRangeFromPoint?.(x, y);
    if (r && el.contains(r.startContainer)) range.setStart(r.startContainer, r.startOffset);
    else return setCaretOffset(el, edge === "first" ? 0 : textLength(el));
  }
  range.collapse(true);
  sel.removeAllRanges();
  sel.addRange(range);
}

/** Removes the first `count` characters of text from the element, preserving markup after them. */
export function removeLeadingChars(el: HTMLElement, count: number) {
  removeRange(el, 0, count);
}

/** Removes characters [start, end) from the element's text, preserving surrounding markup. */
export function removeRange(el: HTMLElement, start: number, end: number) {
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let pos = 0;
  let node: Node | null;
  const edits: [Text, number, number][] = [];
  while ((node = walker.nextNode())) {
    const t = node as Text;
    const len = t.data.length;
    const s = Math.max(start, pos);
    const e = Math.min(end, pos + len);
    if (s < e) edits.push([t, s - pos, e - s]);
    pos += len;
  }
  for (const [t, offset, len] of edits) t.deleteData(offset, len);
}
