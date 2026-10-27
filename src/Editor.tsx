import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { BlockView, type BlockApi } from "./BlockView";
import { caretOnEdgeLine, caretRect, getCaretOffset, isAtEnd, isAtStart, placeCaretAtX, removeLeadingChars, removeRange, setCaretOffset, splitAtCaret } from "./caret";
import { blocksToMarkdown, escapeHtml, htmlToText, markdownToBlocks, mdToHtml, sanitize } from "./markdown";
import { BlockMenu, FormatToolbar, SlashMenu, filterCommands, wrapInlineCode, type Command } from "./menus";
import { LIST_TYPES, uid, type Block, type BlockType, type Doc } from "./types";
import type { Focus, useDocument } from "./useDocument";

type Slash = { blockId: string; start: number; query: string; rect: DOMRect; active: number };
type Drag = { ids: string[]; over: number; y: number; moved: boolean; startY: number };

const SHORTCUTS: [string, BlockType, Partial<Block>?][] = [
  ["### ", "h3"],
  ["## ", "h2"],
  ["# ", "h1"],
  ["[] ", "todo"],
  ["[ ] ", "todo"],
  ["[x] ", "todo", { checked: true }],
  ["- ", "bullet"],
  ["* ", "bullet"],
  ["1. ", "numbered"],
  ["> ", "quote"],
  ["```", "code"],
  ["---", "divider"],
];

const textOf = (html: string) => htmlToText(html);
const editableFor = (id: string) => document.querySelector<HTMLElement>(`[data-editable][data-block-id="${id}"]`);

/** Converts a block's content when its type changes (code blocks hold plain text only). */
function retype(b: Block, type: BlockType, extra: Partial<Block> = {}): Block {
  const html = type === "code" ? escapeHtml(textOf(b.html)) : b.type === "code" ? escapeHtml(textOf(b.html)).replace(/\n/g, "<br>") : b.html;
  return { ...b, type, html, indent: LIST_TYPES.includes(type) ? b.indent ?? 0 : 0, checked: type === "todo" ? b.checked ?? false : undefined, ...extra };
}

export default function Editor({ store }: { store: ReturnType<typeof useDocument> }) {
  const { doc, docRef, commit, undo, redo, pendingFocus } = store;
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [slash, setSlash] = useState<Slash | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [menu, setMenu] = useState<{ id: string; rect: DOMRect } | null>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const slashRef = useRef(slash);
  slashRef.current = slash;
  const selectedRef = useRef(selected);
  selectedRef.current = selected;

  const blocks = doc.blocks;
  const idx = (id: string) => docRef.current.blocks.findIndex((b) => b.id === id);
  const setBlocks = (fn: (b: Block[]) => Block[], opts?: { focus?: Focus; typingIn?: string }) => commit((d: Doc) => ({ ...d, blocks: fn(d.blocks) }), opts);
  const update = (id: string, patch: Partial<Block> | ((b: Block) => Block), opts?: { focus?: Focus; typingIn?: string }) =>
    setBlocks((bs) => bs.map((b) => (b.id === id ? (typeof patch === "function" ? patch(b) : { ...b, ...patch }) : b)), opts);

  // Restore the caret after any structural change or undo
  useLayoutEffect(() => {
    const f = pendingFocus.current;
    if (!f) return;
    pendingFocus.current = null;
    const el = editableFor(f.id);
    if (!el) return;
    el.focus({ preventScroll: true });
    setCaretOffset(el, f.offset === "end" ? el.textContent!.length : f.offset);
    const r = el.getBoundingClientRect();
    if (r.top < 60 || r.bottom > window.innerHeight - 40) el.scrollIntoView({ block: "nearest" });
  });

  // Numbering for numbered lists restarts after any non-list block, per indent level
  const numbers = useMemo(() => {
    const out: (number | undefined)[] = [];
    const counters: number[] = [];
    for (const b of blocks) {
      if (b.type === "numbered") {
        const lvl = b.indent ?? 0;
        counters.length = lvl + 1;
        counters[lvl] = (counters[lvl] ?? 0) + 1;
        out.push(counters[lvl]);
      } else {
        if (!LIST_TYPES.includes(b.type)) counters.length = 0;
        out.push(undefined);
      }
    }
    return out;
  }, [blocks]);

  // ── Structural operations ───────────────────────────────────
  const insertAfter = (id: string, block: Block, focus: Focus = { id: block.id, offset: 0 }) =>
    setBlocks((bs) => {
      const i = bs.findIndex((b) => b.id === id);
      return [...bs.slice(0, i + 1), block, ...bs.slice(i + 1)];
    }, { focus });

  const moveBlocks = (ids: string[], to: number) =>
    setBlocks((bs) => {
      const moving = bs.filter((b) => ids.includes(b.id));
      const before = bs.slice(0, to).filter((b) => !ids.includes(b.id)).length;
      const rest = bs.filter((b) => !ids.includes(b.id));
      return [...rest.slice(0, before), ...moving, ...rest.slice(before)];
    });

  const shift = (ids: string[], dir: -1 | 1) => {
    const bs = docRef.current.blocks;
    const positions = ids.map(idx).sort((a, b) => a - b);
    if (!positions.length) return;
    const target = dir < 0 ? positions[0] - 1 : positions[positions.length - 1] + 2;
    if (target < 0 || target > bs.length) return;
    const focus = (document.activeElement as HTMLElement)?.closest<HTMLElement>("[data-editable]");
    if (focus) pendingFocus.current = { id: focus.dataset.blockId!, offset: getCaretOffset(focus) };
    moveBlocks(ids, target);
  };

  const removeBlocks = (ids: Set<string>) => {
    const bs = docRef.current.blocks;
    const first = bs.findIndex((b) => ids.has(b.id));
    const rest = bs.filter((b) => !ids.has(b.id));
    const fallback = rest[Math.max(0, first - 1)];
    if (!rest.length) {
      const fresh = { id: uid(), type: "p" as const, html: "" };
      setBlocks(() => [fresh], { focus: { id: fresh.id, offset: 0 } });
    } else setBlocks(() => rest, fallback && fallback.type !== "divider" ? { focus: { id: fallback.id, offset: "end" } } : undefined);
    setSelected(new Set());
  };

  const duplicate = (ids: string[]) => {
    const bs = docRef.current.blocks;
    const last = Math.max(...ids.map(idx));
    const copies = bs.filter((b) => ids.includes(b.id)).map((b) => ({ ...b, id: uid() }));
    setBlocks((all) => [...all.slice(0, last + 1), ...copies, ...all.slice(last + 1)]);
    setSelected(new Set(copies.map((c) => c.id)));
  };

  // ── Slash menu ──────────────────────────────────────────────
  const slashItems = useMemo(() => (slash ? filterCommands(slash.query) : []), [slash]);

  const pickCommand = (c: Command) => {
    const s = slashRef.current;
    if (!s) return;
    const el = editableFor(s.blockId);
    setSlash(null);
    if (!el) return;
    removeRange(el, s.start, Math.max(s.start, getCaretOffset(el)));
    const html = sanitize(el.innerHTML);
    const block = docRef.current.blocks[idx(s.blockId)];
    const empty = !el.textContent?.trim();
    if (c.type === "divider") {
      const next = { id: uid(), type: "p" as const, html: empty ? "" : "" };
      setBlocks((bs) => {
        const i = bs.findIndex((b) => b.id === s.blockId);
        const head = empty ? [{ ...bs[i], type: "divider" as const, html: "" }] : [{ ...bs[i], html }, { id: uid(), type: "divider" as const, html: "" }];
        return [...bs.slice(0, i), ...head, next, ...bs.slice(i + 1)];
      }, { focus: { id: next.id, offset: 0 } });
    } else if (empty) {
      update(s.blockId, (b) => retype({ ...b, html: "" }, c.type), { focus: { id: s.blockId, offset: 0 } });
    } else {
      update(s.blockId, { html });
      insertAfter(block.id, retype({ id: uid(), type: "p", html: "" }, c.type));
    }
  };

  // ── Block API (stable identity so memoised blocks don't re-render) ──
  const handlers = useRef<BlockApi>(null!);
  handlers.current = {
    onFocus: () => setSelected((s) => (s.size ? new Set() : s)),

    toggleTodo: (id) => update(id, (b) => ({ ...b, checked: !b.checked })),

    addBelow: (id) => {
      const b = { id: uid(), type: "p" as const, html: "" };
      insertAfter(id, b);
      requestAnimationFrame(() => {
        const r = editableFor(b.id)?.getBoundingClientRect();
        if (r) setSlash({ blockId: b.id, start: 0, query: "", rect: r, active: 0 });
      });
    },

    onInput: (block, el) => {
      if (el.innerHTML === "<br>") el.innerHTML = "";
      const offset = getCaretOffset(el);
      const text = (el.textContent ?? "").replace(/ /g, " ");

      // Markdown shortcuts at the start of a paragraph
      if (block.type === "p") {
        for (const [prefix, type, extra] of SHORTCUTS) {
          if (text.startsWith(prefix) && offset === prefix.length) {
            removeLeadingChars(el, prefix.length);
            const html = sanitize(el.innerHTML);
            setSlash(null);
            if (type === "divider") {
              const next = { id: uid(), type: "p" as const, html };
              setBlocks((bs) => {
                const i = bs.findIndex((b) => b.id === block.id);
                return [...bs.slice(0, i), { ...bs[i], type: "divider", html: "" }, next, ...bs.slice(i + 1)];
              }, { focus: { id: next.id, offset: 0 } });
            } else update(block.id, (b) => retype({ ...b, html }, type, extra), { focus: { id: block.id, offset: 0 } });
            return;
          }
        }
      }

      const html = block.type === "code" ? escapeHtml(el.innerText) : sanitize(el.innerHTML);
      update(block.id, { html }, { typingIn: block.id });

      // Slash menu: "/" at the start or after a space, followed by a short query
      if (block.type !== "code") {
        const m = text.slice(0, offset).match(/(?:^|\s)\/([a-z0-9 ]{0,16})$/i);
        const rect = caretRect();
        if (m && rect && !(m[1].endsWith(" ") && !filterCommands(m[1]).length)) {
          setSlash((s) => ({ blockId: block.id, start: offset - m[1].length - 1, query: m[1], rect, active: s?.blockId === block.id ? Math.min(s.active, Math.max(0, filterCommands(m[1]).length - 1)) : 0 }));
        } else if (slashRef.current) setSlash(null);
      }
    },

    onPaste: (e, block, el) => {
      const text = e.clipboardData.getData("text/plain");
      const sel = window.getSelection();
      if (block.type === "code") {
        e.preventDefault();
        document.execCommand("insertText", false, text);
        return;
      }
      // Pasting a URL over selected text makes a link
      if (/^https?:\/\/\S+$/.test(text.trim()) && sel && !sel.isCollapsed) {
        e.preventDefault();
        document.execCommand("createLink", false, text.trim());
        return;
      }
      e.preventDefault();
      if (!text.includes("\n")) {
        document.execCommand("insertHTML", false, mdToHtml(text));
        return;
      }
      // Multi-line paste: parse as Markdown into real blocks
      const parsed = markdownToBlocks(text);
      if (!parsed.length) return;
      const [before, after] = splitAtCaret(el);
      const first = parsed[0];
      const merged: Block[] = first.type === "p" ? [{ ...block, html: sanitize(before + first.html) }, ...parsed.slice(1)] : [{ ...block, html: sanitize(before) }, ...parsed];
      const last = merged[merged.length - 1];
      const caret = textOf(last.html).length;
      merged[merged.length - 1] = { ...last, html: last.type === "code" ? last.html : sanitize(last.html + after) };
      setBlocks((bs) => {
        const i = bs.findIndex((b) => b.id === block.id);
        return [...bs.slice(0, i), ...merged, ...bs.slice(i + 1)];
      }, { focus: { id: last.id, offset: caret } });
    },

    onKeyDown: (e, block, el) => {
      const mod = e.metaKey || e.ctrlKey;
      const key = e.key;
      const bs = docRef.current.blocks;
      const i = idx(block.id);
      const run = (fn: () => void) => {
        e.preventDefault();
        fn();
      };

      // Slash menu has the keyboard while it's open
      const s = slashRef.current;
      if (s && s.blockId === block.id) {
        const items = filterCommands(s.query);
        if (key === "ArrowDown" || (key === "Tab" && !e.shiftKey)) return run(() => setSlash({ ...s, active: (s.active + 1) % Math.max(1, items.length) }));
        if (key === "ArrowUp" || (key === "Tab" && e.shiftKey)) return run(() => setSlash({ ...s, active: (s.active - 1 + items.length) % Math.max(1, items.length) }));
        if (key === "Enter" && items.length) return run(() => pickCommand(items[s.active]));
        if (key === "Escape") return run(() => setSlash(null));
      }

      if (mod && key.toLowerCase() === "z") return run(e.shiftKey ? redo : undo);
      if (mod && key.toLowerCase() === "y") return run(redo);
      if (mod && e.shiftKey && (key === "ArrowUp" || key === "ArrowDown")) return run(() => shift([block.id], key === "ArrowUp" ? -1 : 1));
      if (mod && key.toLowerCase() === "d") return run(() => duplicate([block.id]));
      if (block.type !== "code") {
        if (mod && key.toLowerCase() === "b") return run(() => document.execCommand("bold"));
        if (mod && key.toLowerCase() === "i") return run(() => document.execCommand("italic"));
        if (mod && key.toLowerCase() === "u") return run(() => document.execCommand("underline"));
        if (mod && e.shiftKey && key.toLowerCase() === "s") return run(() => document.execCommand("strikeThrough"));
        if (mod && key.toLowerCase() === "e") return run(wrapInlineCode);
        if (mod && key.toLowerCase() === "k") return run(() => window.dispatchEvent(new Event("stanza:link")));
      }
      if (mod && e.altKey && /^[0-3]$/.test(key)) {
        const type = (["p", "h1", "h2", "h3"] as const)[+key];
        return run(() => update(block.id, (b) => retype(b, type), { focus: { id: block.id, offset: getCaretOffset(el) } }));
      }

      if (key === "Escape") return run(() => (el.blur(), setSelected(new Set([block.id]))));

      if (key === "Enter" && !e.shiftKey) {
        if (block.type === "code" && !mod) return; // newline inside code; ⌘Enter exits
        e.preventDefault();
        if (LIST_TYPES.includes(block.type) && !el.textContent) {
          // Enter on an empty list item outdents, then leaves the list
          return (block.indent ?? 0) > 0
            ? update(block.id, { indent: (block.indent ?? 0) - 1 }, { focus: { id: block.id, offset: 0 } })
            : update(block.id, (b) => retype(b, "p"), { focus: { id: block.id, offset: 0 } });
        }
        if (block.type === "code") return insertAfter(block.id, { id: uid(), type: "p", html: "" });
        const atStart = isAtStart(el) && !!el.textContent;
        if (atStart) {
          // Enter at the start keeps this block intact and opens a line above it
          const above: Block = { id: uid(), type: LIST_TYPES.includes(block.type) ? block.type : "p", html: "", indent: block.indent };
          return setBlocks((all) => [...all.slice(0, i), above, ...all.slice(i)], { focus: { id: block.id, offset: 0 } });
        }
        const [before, after] = splitAtCaret(el);
        const nextType: BlockType = LIST_TYPES.includes(block.type) ? block.type : "p";
        const next: Block = { id: uid(), type: nextType, html: sanitize(after), indent: LIST_TYPES.includes(nextType) ? block.indent : undefined, checked: nextType === "todo" ? false : undefined };
        return setBlocks((all) => [...all.slice(0, i), { ...block, html: sanitize(before) }, next, ...all.slice(i + 1)], { focus: { id: next.id, offset: 0 } });
      }

      if (key === "Backspace" && isAtStart(el)) {
        e.preventDefault();
        if (block.type !== "p") {
          if ((block.indent ?? 0) > 0) return update(block.id, { indent: (block.indent ?? 0) - 1 }, { focus: { id: block.id, offset: 0 } });
          return update(block.id, (b) => retype(b, "p"), { focus: { id: block.id, offset: 0 } });
        }
        const prev = bs[i - 1];
        if (!prev) return;
        if (prev.type === "divider") return setBlocks((all) => all.filter((b) => b.id !== prev.id), { focus: { id: block.id, offset: 0 } });
        const offset = textOf(prev.html).length;
        const html = prev.type === "code" ? prev.html + escapeHtml(textOf(block.html)) : sanitize(prev.html + block.html);
        return setBlocks((all) => all.filter((b) => b.id !== block.id).map((b) => (b.id === prev.id ? { ...b, html } : b)), { focus: { id: prev.id, offset } });
      }

      if (key === "Delete" && isAtEnd(el)) {
        const next = bs[i + 1];
        if (!next) return;
        e.preventDefault();
        const offset = textOf(block.html).length;
        if (next.type === "divider") return setBlocks((all) => all.filter((b) => b.id !== next.id), { focus: { id: block.id, offset } });
        return setBlocks((all) => all.filter((b) => b.id !== next.id).map((b) => (b.id === block.id ? { ...b, html: sanitize(b.html + next.html) } : b)), { focus: { id: block.id, offset } });
      }

      if (key === "Tab") {
        e.preventDefault();
        if (block.type === "code") return document.execCommand("insertText", false, "  ");
        if (!LIST_TYPES.includes(block.type)) return;
        const max = i > 0 && LIST_TYPES.includes(bs[i - 1].type) ? Math.min(3, (bs[i - 1].indent ?? 0) + 1) : 0;
        const indent = e.shiftKey ? Math.max(0, (block.indent ?? 0) - 1) : Math.min(max, (block.indent ?? 0) + 1);
        return update(block.id, { indent }, { focus: { id: block.id, offset: getCaretOffset(el) } });
      }

      // Arrow keys cross block boundaries, keeping the caret's horizontal position
      const editableNeighbour = (dir: -1 | 1) => {
        for (let j = i + dir; j >= 0 && j < bs.length; j += dir) {
          const n = editableFor(bs[j].id);
          if (n) return n;
        }
        return null;
      };
      if ((key === "ArrowUp" || key === "ArrowDown") && !e.shiftKey && !mod) {
        const dir = key === "ArrowUp" ? -1 : 1;
        if (!caretOnEdgeLine(el, dir < 0 ? "first" : "last")) return;
        const target = editableNeighbour(dir);
        if (!target) return;
        const x = caretRect()?.left ?? el.getBoundingClientRect().left;
        return run(() => {
          target.focus({ preventScroll: true });
          placeCaretAtX(target, x, dir < 0 ? "last" : "first");
          target.scrollIntoView({ block: "nearest" });
        });
      }
      if (key === "ArrowLeft" && !e.shiftKey && isAtStart(el)) {
        const t = editableNeighbour(-1);
        if (t) return run(() => (t.focus(), setCaretOffset(t, t.textContent!.length)));
      }
      if (key === "ArrowRight" && !e.shiftKey && isAtEnd(el)) {
        const t = editableNeighbour(1);
        if (t) return run(() => (t.focus(), setCaretOffset(t, 0)));
      }
      if (key === "ArrowUp" && i === 0 && caretOnEdgeLine(el, "first")) return run(() => titleRef.current?.focus());
    },

    onHandlePointerDown: (e, id) => {
      e.preventDefault();
      const target = e.currentTarget as HTMLElement;
      target.setPointerCapture(e.pointerId);
      const ids = selectedRef.current.has(id) ? docRef.current.blocks.filter((b) => selectedRef.current.has(b.id)).map((b) => b.id) : [id];
      const startY = e.clientY;
      let state: Drag = { ids, over: idx(id), y: 0, moved: false, startY };

      const move = (ev: PointerEvent) => {
        if (!state.moved && Math.abs(ev.clientY - startY) < 4) return;
        const rows = [...document.querySelectorAll<HTMLElement>("[data-block-row]")];
        let over = rows.length;
        for (let k = 0; k < rows.length; k++) {
          const r = rows[k].getBoundingClientRect();
          if (ev.clientY < r.top + r.height / 2) {
            over = k;
            break;
          }
        }
        const ref = rows[Math.min(over, rows.length - 1)].getBoundingClientRect();
        const container = document.getElementById("blocks")!.getBoundingClientRect();
        const y = (over < rows.length ? ref.top : ref.bottom) - container.top;
        state = { ...state, over, y, moved: true };
        setDrag(state);
      };
      const up = () => {
        target.removeEventListener("pointermove", move);
        target.removeEventListener("pointerup", up);
        target.removeEventListener("pointercancel", up);
        setDrag(null);
        if (state.moved) {
          moveBlocks(state.ids, state.over);
          setSelected(new Set(state.ids));
        } else {
          setSelected(new Set([id]));
          setMenu({ id, rect: target.getBoundingClientRect() });
        }
      };
      target.addEventListener("pointermove", move);
      target.addEventListener("pointerup", up);
      target.addEventListener("pointercancel", up);
    },
  };

  const api = useMemo<BlockApi>(
    () => ({
      onInput: (...a) => handlers.current.onInput(...a),
      onKeyDown: (...a) => handlers.current.onKeyDown(...a),
      onPaste: (...a) => handlers.current.onPaste(...a),
      onFocus: (...a) => handlers.current.onFocus(...a),
      toggleTodo: (...a) => handlers.current.toggleTodo(...a),
      onHandlePointerDown: (...a) => handlers.current.onHandlePointerDown(...a),
      addBelow: (...a) => handlers.current.addBelow(...a),
    }),
    [],
  );

  // ── Block-selection mode (Esc from a block, or click a handle) ──
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const sel = selectedRef.current;
      if (!sel.size || (e.target as HTMLElement).closest("[data-editable], input, textarea, [contenteditable]")) return;
      const bs = docRef.current.blocks;
      const ids = bs.filter((b) => sel.has(b.id)).map((b) => b.id);
      const mod = e.metaKey || e.ctrlKey;
      const first = idx(ids[0]);
      const last = idx(ids[ids.length - 1]);
      const run = (fn: () => void) => {
        e.preventDefault();
        fn();
      };
      if (e.key === "Backspace" || e.key === "Delete") return run(() => removeBlocks(sel));
      if (e.key === "Escape") return run(() => setSelected(new Set()));
      if (mod && e.key.toLowerCase() === "z") return run(e.shiftKey ? redo : undo);
      if (mod && e.key.toLowerCase() === "d") return run(() => duplicate(ids));
      if (mod && e.key.toLowerCase() === "a") return run(() => setSelected(new Set(bs.map((b) => b.id))));
      if (mod && e.key.toLowerCase() === "c") return run(() => navigator.clipboard?.writeText(blocksToMarkdown(bs.filter((b) => sel.has(b.id)))));
      if (mod && e.shiftKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) return run(() => shift(ids, e.key === "ArrowUp" ? -1 : 1));
      if (e.key === "ArrowUp" || e.key === "ArrowDown") {
        return run(() => {
          const dir = e.key === "ArrowUp" ? -1 : 1;
          const anchor = dir < 0 ? first : last;
          const next = bs[Math.max(0, Math.min(bs.length - 1, anchor + dir))];
          setSelected(e.shiftKey ? new Set([...ids, next.id]) : new Set([next.id]));
        });
      }
      if (e.key === "Enter") {
        const b = bs[last];
        return run(() => {
          setSelected(new Set());
          if (b.type !== "divider") {
            const el = editableFor(b.id);
            el?.focus();
            if (el) setCaretOffset(el, el.textContent!.length);
          }
        });
      }
    };
    const onDown = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest("[data-block-row] button, [role=menu]")) setSelected((s) => (s.size ? new Set() : s));
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onDown);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onMenuPick = (action: string) => {
    if (!menu) return;
    const { id } = menu;
    setMenu(null);
    if (action === "duplicate") duplicate([id]);
    else if (action === "delete") removeBlocks(new Set([id]));
    else if (action === "up" || action === "down") shift([id], action === "up" ? -1 : 1);
    else if (action.startsWith("turn:")) {
      const type = action.slice(5) as BlockType;
      update(id, (b) => retype(b, type), { focus: { id, offset: "end" } });
    }
  };
  const closeMenu = useCallback(() => setMenu(null), []);

  // ── Title ───────────────────────────────────────────────────
  const titleSynced = useRef(false);
  useLayoutEffect(() => {
    const el = titleRef.current!;
    if (!titleSynced.current || el.textContent !== doc.title) {
      if (document.activeElement !== el) el.textContent = doc.title;
      titleSynced.current = true;
    }
  }, [doc.title]);

  const focusFirst = () => {
    const first = docRef.current.blocks.find((b) => b.type !== "divider");
    if (first) {
      const el = editableFor(first.id);
      el?.focus();
      if (el) setCaretOffset(el, 0);
    } else {
      const b = { id: uid(), type: "p" as const, html: "" };
      setBlocks((bs) => [b, ...bs], { focus: { id: b.id, offset: 0 } });
    }
  };

  const clickBelow = () => {
    const bs = docRef.current.blocks;
    const last = bs[bs.length - 1];
    if (last && last.type === "p" && !textOf(last.html)) {
      const el = editableFor(last.id);
      el?.focus();
      return;
    }
    const b = { id: uid(), type: "p" as const, html: "" };
    setBlocks((all) => [...all, b], { focus: { id: b.id, offset: 0 } });
  };

  return (
    <>
      <h1
        ref={titleRef}
        contentEditable="plaintext-only"
        suppressContentEditableWarning
        role="textbox"
        aria-label="Page title"
        data-placeholder="Untitled"
        onInput={(e) => commit((d) => ({ ...d, title: e.currentTarget.textContent ?? "" }), { typingIn: "title" })}
        onKeyDown={(e) => {
          if (e.key === "Enter" || (e.key === "ArrowDown" && caretOnEdgeLine(e.currentTarget, "last"))) {
            e.preventDefault();
            focusFirst();
          }
          if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
            e.preventDefault();
            (e.shiftKey ? redo : undo)();
          }
        }}
        className="title mb-4 text-[40px] font-bold leading-tight tracking-tight outline-none"
      />

      <div id="blocks" className="relative" onDragStart={(e) => e.preventDefault()}>
        {blocks.map((b, i) => (
          <BlockView key={b.id} block={b} number={numbers[i]} selected={selected.has(b.id)} dragging={!!drag?.moved && drag.ids.includes(b.id)} api={api} />
        ))}
        {drag?.moved && <div className="pointer-events-none absolute -left-2 right-0 h-[3px] -translate-y-1/2 rounded-full bg-accent" style={{ top: drag.y }} aria-hidden="true" />}
      </div>
      <div className="min-h-[30vh] cursor-text" onClick={clickBelow} aria-hidden="true" />

      {slash && <SlashMenu anchor={slash.rect} items={slashItems} active={slash.active} onPick={pickCommand} onHover={(a) => setSlash((s) => s && { ...s, active: a })} />}
      {menu && <BlockMenu anchor={menu.rect} onPick={onMenuPick} onClose={closeMenu} />}
      <FormatToolbar />
    </>
  );
}
