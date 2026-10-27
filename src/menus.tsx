import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { BlockType } from "./types";

export type Command = { type: BlockType; label: string; hint: string; keywords: string; icon: string; md?: string };

export const COMMANDS: Command[] = [
  { type: "p", label: "Text", hint: "Plain paragraph", keywords: "text paragraph plain", icon: "Aa" },
  { type: "h1", label: "Heading 1", hint: "Big section heading", keywords: "heading title h1", icon: "H1", md: "#" },
  { type: "h2", label: "Heading 2", hint: "Medium section heading", keywords: "heading subtitle h2", icon: "H2", md: "##" },
  { type: "h3", label: "Heading 3", hint: "Small section heading", keywords: "heading h3", icon: "H3", md: "###" },
  { type: "bullet", label: "Bulleted list", hint: "A simple list", keywords: "bullet list unordered ul", icon: "•", md: "-" },
  { type: "numbered", label: "Numbered list", hint: "A list with numbers", keywords: "numbered ordered list ol", icon: "1.", md: "1." },
  { type: "todo", label: "To-do list", hint: "Track tasks", keywords: "todo task checkbox check", icon: "☑", md: "[]" },
  { type: "quote", label: "Quote", hint: "Capture a quote", keywords: "quote blockquote", icon: "❝", md: ">" },
  { type: "callout", label: "Callout", hint: "Make it stand out", keywords: "callout note tip info", icon: "💡" },
  { type: "code", label: "Code", hint: "Monospaced code block", keywords: "code snippet pre", icon: "</>", md: "```" },
  { type: "divider", label: "Divider", hint: "Separate sections", keywords: "divider line hr separator", icon: "—", md: "---" },
];

export function filterCommands(query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return COMMANDS;
  return COMMANDS.filter((c) => c.label.toLowerCase().includes(q) || c.keywords.includes(q));
}

/** Positions a floating element under (or above, if there's no room) an anchor rect. */
function useFloating(anchor: DOMRect, gap = 6) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number }>({ left: anchor.left, top: anchor.bottom + gap });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const h = el.offsetHeight;
    const w = el.offsetWidth;
    const top = anchor.bottom + gap + h > window.innerHeight - 8 ? anchor.top - gap - h : anchor.bottom + gap;
    setPos({ left: Math.max(8, Math.min(anchor.left, window.innerWidth - w - 8)), top: Math.max(8, top) });
  }, [anchor, gap]);
  return { ref, pos };
}

export function SlashMenu({ anchor, items, active, onPick, onHover }: { anchor: DOMRect; items: Command[]; active: number; onPick: (c: Command) => void; onHover: (i: number) => void }) {
  const { ref, pos } = useFloating(anchor);
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  return (
    <div ref={ref} className="fixed z-50 w-72 overflow-hidden rounded-xl border border-line bg-panel shadow-2xl" style={pos}>
      {items.length ? (
        <>
          <p className="px-3 pb-1 pt-2.5 text-[11px] font-medium uppercase tracking-wide text-muted">Basic blocks</p>
          <ul ref={listRef} role="listbox" id="slash-menu" aria-label="Block types" className="max-h-80 overflow-y-auto p-1">
            {items.map((c, i) => (
              <li
                key={c.type}
                data-index={i}
                role="option"
                id={`slash-${c.type}`}
                aria-selected={i === active}
                onMouseDown={(e) => {
                  e.preventDefault();
                  onPick(c);
                }}
                onMouseMove={() => onHover(i)}
                className={`flex cursor-pointer items-center gap-3 rounded-lg px-2 py-1.5 ${i === active ? "bg-hover" : ""}`}
              >
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-line bg-bg text-sm font-semibold text-muted">{c.icon}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">{c.label}</span>
                  <span className="block truncate text-xs text-muted">{c.hint}</span>
                </span>
                {c.md && <kbd className="font-mono text-[11px] text-muted">{c.md}</kbd>}
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="px-3 py-3 text-sm text-muted">No matching blocks</p>
      )}
    </div>
  );
}

export function BlockMenu({ anchor, onPick, onClose }: { anchor: DOMRect; onPick: (action: string) => void; onClose: () => void }) {
  const { ref, pos } = useFloating(anchor, 4);
  useEffect(() => {
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && onClose();
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", esc);
    ref.current?.querySelector("button")?.focus();
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", esc);
    };
  }, [onClose, ref]);

  const item = (action: string, label: string, kbd?: string) => (
    <button key={action} type="button" role="menuitem" onClick={() => onPick(action)} className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm hover:bg-hover focus:bg-hover focus:outline-none">
      {label}
      {kbd && <kbd className="font-mono text-[11px] text-muted">{kbd}</kbd>}
    </button>
  );

  return (
    <div ref={ref} role="menu" aria-label="Block options" className="fixed z-50 w-56 rounded-xl border border-line bg-panel p-1 shadow-2xl" style={pos}>
      {item("duplicate", "Duplicate", "⌘D")}
      {item("up", "Move up", "⌘⇧↑")}
      {item("down", "Move down", "⌘⇧↓")}
      {item("delete", "Delete", "Del")}
      <p className="px-2 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wide text-muted">Turn into</p>
      <div className="max-h-56 overflow-y-auto">{COMMANDS.filter((c) => c.type !== "divider").map((c) => item(`turn:${c.type}`, c.label))}</div>
    </div>
  );
}

const FORMATS = [
  { cmd: "bold", label: "Bold", kbd: "⌘B", node: <b>B</b> },
  { cmd: "italic", label: "Italic", kbd: "⌘I", node: <i className="font-serif">i</i> },
  { cmd: "underline", label: "Underline", kbd: "⌘U", node: <u>U</u> },
  { cmd: "strikeThrough", label: "Strikethrough", kbd: "⌘⇧S", node: <s>S</s> },
  { cmd: "code", label: "Inline code", kbd: "⌘E", node: <span className="font-mono text-[12px]">{"</>"}</span> },
];

export function wrapInlineCode() {
  const sel = window.getSelection();
  if (!sel?.rangeCount || sel.isCollapsed) return;
  const range = sel.getRangeAt(0);
  const host = (range.commonAncestorContainer.nodeType === 1 ? range.commonAncestorContainer : range.commonAncestorContainer.parentElement) as HTMLElement;
  const existing = host.closest("code");
  if (existing) {
    // Toggle off: unwrap
    existing.replaceWith(...existing.childNodes);
  } else {
    const code = document.createElement("code");
    code.appendChild(range.extractContents());
    range.insertNode(code);
    sel.selectAllChildren(code);
  }
  host.closest("[data-editable]")?.dispatchEvent(new Event("input", { bubbles: true }));
}

/** Floating toolbar shown over a text selection inside a block. */
export function FormatToolbar() {
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [linking, setLinking] = useState(false);
  const [, force] = useState(0);
  const saved = useRef<Range | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onSel = () => {
      if (linking) return;
      const sel = window.getSelection();
      const editable = sel?.anchorNode && (sel.anchorNode.nodeType === 1 ? (sel.anchorNode as Element) : sel.anchorNode.parentElement)?.closest("[data-editable]");
      if (!sel || sel.isCollapsed || !sel.rangeCount || !editable || editable.getAttribute("data-type") === "code") return setRect(null);
      setRect(sel.getRangeAt(0).getBoundingClientRect());
      force((n) => n + 1);
    };
    const openLink = () => {
      const sel = window.getSelection();
      if (!sel?.rangeCount || sel.isCollapsed) return;
      saved.current = sel.getRangeAt(0).cloneRange();
      setRect(sel.getRangeAt(0).getBoundingClientRect());
      setLinking(true);
    };
    document.addEventListener("selectionchange", onSel);
    window.addEventListener("scroll", onSel, { passive: true });
    window.addEventListener("resize", onSel);
    window.addEventListener("stanza:link", openLink);
    return () => {
      document.removeEventListener("selectionchange", onSel);
      window.removeEventListener("scroll", onSel);
      window.removeEventListener("resize", onSel);
      window.removeEventListener("stanza:link", openLink);
    };
  }, [linking]);

  useEffect(() => {
    if (linking) inputRef.current?.focus();
  }, [linking]);

  if (!rect) return null;

  const restore = () => {
    const sel = window.getSelection()!;
    if (saved.current) {
      sel.removeAllRanges();
      sel.addRange(saved.current);
    }
  };

  const applyLink = (url: string) => {
    restore();
    const href = url.trim() && !/^[a-z]+:/i.test(url.trim()) ? `https://${url.trim()}` : url.trim();
    document.execCommand(href ? "createLink" : "unlink", false, href);
    setLinking(false);
  };

  const state = (cmd: string) => {
    try {
      return document.queryCommandState(cmd);
    } catch {
      return false;
    }
  };

  return (
    <div
      role="toolbar"
      aria-label="Text formatting"
      className="fixed z-50 flex -translate-x-1/2 items-center gap-0.5 rounded-lg border border-line bg-panel p-1 shadow-xl"
      style={{ left: Math.max(140, Math.min(rect.left + rect.width / 2, window.innerWidth - 140)), top: Math.max(8, rect.top - 46) }}
      onMouseDown={(e) => e.target !== inputRef.current && e.preventDefault()}
    >
      {linking ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            applyLink(inputRef.current!.value);
          }}
          className="flex items-center gap-1"
        >
          <input ref={inputRef} placeholder="Paste a link…" aria-label="Link URL" onKeyDown={(e) => e.key === "Escape" && (setLinking(false), restore())} className="h-7 w-56 rounded-md bg-bg px-2 text-sm outline-none" />
          <button type="submit" className="h-7 rounded-md bg-accent px-2 text-xs font-medium text-white">Link</button>
        </form>
      ) : (
        <>
          {FORMATS.map((f) => (
            <button
              key={f.cmd}
              type="button"
              title={`${f.label} ${f.kbd}`}
              aria-label={f.label}
              aria-pressed={f.cmd !== "code" && state(f.cmd)}
              onClick={() => (f.cmd === "code" ? wrapInlineCode() : document.execCommand(f.cmd))}
              className={`grid h-7 min-w-7 place-items-center rounded-md px-1.5 text-sm hover:bg-hover ${f.cmd !== "code" && state(f.cmd) ? "text-accent" : ""}`}
            >
              {f.node}
            </button>
          ))}
          <span className="mx-0.5 h-5 w-px bg-line" />
          <button
            type="button"
            title="Link ⌘K"
            onClick={() => {
              const sel = window.getSelection();
              if (sel?.rangeCount) saved.current = sel.getRangeAt(0).cloneRange();
              setLinking(true);
            }}
            className="h-7 rounded-md px-2 text-sm hover:bg-hover"
          >
            Link
          </button>
        </>
      )}
    </div>
  );
}
