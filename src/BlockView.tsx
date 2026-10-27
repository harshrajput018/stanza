import { memo, useLayoutEffect, useRef } from "react";
import { escapeHtml, sanitize } from "./markdown";
import type { Block, BlockType } from "./types";

export type BlockApi = {
  onInput: (block: Block, el: HTMLElement) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLElement>, block: Block, el: HTMLElement) => void;
  onPaste: (e: React.ClipboardEvent<HTMLElement>, block: Block, el: HTMLElement) => void;
  onFocus: (block: Block) => void;
  toggleTodo: (id: string) => void;
  onHandlePointerDown: (e: React.PointerEvent, id: string) => void;
  addBelow: (id: string) => void;
};

const PLACEHOLDER: Record<BlockType, string> = {
  p: "Type '/' for commands, or just start writing",
  h1: "Heading 1",
  h2: "Heading 2",
  h3: "Heading 3",
  bullet: "List item",
  numbered: "List item",
  todo: "To-do",
  quote: "Quote",
  code: "// code",
  callout: "Something worth calling out",
  divider: "",
};

const TEXT_CLASS: Record<BlockType, string> = {
  p: "text-[16px] leading-7",
  h1: "mt-6 text-[30px] font-bold leading-tight tracking-tight",
  h2: "mt-4 text-[23px] font-semibold leading-snug tracking-tight",
  h3: "mt-2 text-[19px] font-semibold leading-snug",
  bullet: "text-[16px] leading-7",
  numbered: "text-[16px] leading-7",
  todo: "text-[16px] leading-7",
  quote: "border-l-[3px] border-fg pl-4 text-[17px] italic leading-7",
  code: "w-full whitespace-pre-wrap rounded-md bg-code px-4 py-3 font-mono text-[13.5px] leading-6",
  callout: "text-[16px] leading-7",
  divider: "",
};

const BULLETS = ["•", "◦", "▪", "•"];

function Marker({ block, number, onToggle }: { block: Block; number?: number; onToggle: () => void }) {
  switch (block.type) {
    case "bullet":
      return <span className="w-6 shrink-0 select-none text-center text-[18px] leading-7" aria-hidden="true">{BULLETS[block.indent ?? 0]}</span>;
    case "numbered":
      return <span className="w-6 shrink-0 select-none text-right text-[16px] leading-7 tabular-nums" aria-hidden="true">{number}.</span>;
    case "todo":
      return (
        <span className="flex h-7 w-6 shrink-0 items-center justify-center">
          <input type="checkbox" checked={!!block.checked} onChange={onToggle} aria-label="Done" className="h-4 w-4 cursor-pointer accent-[var(--accent)]" />
        </span>
      );
    case "callout":
      return <span className="w-6 shrink-0 select-none pt-0.5 text-center text-[18px] leading-7" aria-hidden="true">💡</span>;
    default:
      return <span className="hidden" />;
  }
}

type Props = { block: Block; number?: number; selected: boolean; dragging: boolean; api: BlockApi };

export const BlockView = memo(function BlockView({ block, number, selected, dragging, api }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const isCode = block.type === "code";

  // Only touch the DOM when the model changed from outside (undo, paste, merge…) — never while typing.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const current = isCode ? escapeHtml(el.innerText) : sanitize(el.innerHTML);
    if (current !== block.html) el.innerHTML = block.html;
  }, [block.html, isCode]);

  return (
    <div
      data-block-row={block.id}
      className={`group relative -mx-2 flex items-start rounded-md px-2 py-[3px] transition-colors ${selected ? "bg-accent-soft" : ""} ${dragging ? "opacity-40" : ""} ${
        block.type === "callout" ? "my-1 bg-surface py-3" : ""
      }`}
      style={{ marginLeft: (block.indent ?? 0) * 24 - 8 }}
    >
      <div className="absolute -left-12 top-[3px] hidden h-7 items-center gap-0.5 opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-60 md:flex">
        <button type="button" tabIndex={-1} aria-label="Add a block below" title="Add a block below" onClick={() => api.addBelow(block.id)} className="grid h-6 w-5 place-items-center rounded text-muted hover:bg-hover hover:text-fg">
          <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M8 3v10M3 8h10" /></svg>
        </button>
        <button
          type="button"
          aria-label="Drag to move, click for options"
          title="Drag to move · click for options"
          onPointerDown={(e) => api.onHandlePointerDown(e, block.id)}
          className="grid h-6 w-5 cursor-grab touch-none place-items-center rounded text-muted hover:bg-hover hover:text-fg active:cursor-grabbing"
        >
          <svg viewBox="0 0 10 16" className="h-3.5 w-2.5" fill="currentColor" aria-hidden="true">{[3, 8, 13].flatMap((y) => [2, 8].map((x) => <circle key={`${x}${y}`} cx={x} cy={y} r="1.4" />))}</svg>
        </button>
      </div>

      <Marker block={block} number={number} onToggle={() => api.toggleTodo(block.id)} />

      {block.type === "divider" ? (
        <div className="flex h-7 w-full items-center" role="separator">
          <hr className="w-full border-line" />
        </div>
      ) : (
        <div
          ref={ref}
          data-editable
          data-block-id={block.id}
          data-type={block.type}
          data-placeholder={PLACEHOLDER[block.type]}
          role="textbox"
          aria-multiline="true"
          aria-label={PLACEHOLDER[block.type].replace("Type '/' for commands, or just start writing", "Text")}
          contentEditable={isCode ? "plaintext-only" : true}
          suppressContentEditableWarning
          spellCheck={!isCode}
          onInput={(e) => api.onInput(block, e.currentTarget)}
          onKeyDown={(e) => api.onKeyDown(e, block, e.currentTarget)}
          onPaste={(e) => api.onPaste(e, block, e.currentTarget)}
          onFocus={() => api.onFocus(block)}
          className={`min-w-0 flex-1 break-words outline-none ${TEXT_CLASS[block.type]} ${block.type === "todo" && block.checked ? "text-muted line-through" : ""} ${block.type === "numbered" || block.type === "bullet" || block.type === "todo" || block.type === "callout" ? "pl-1.5" : ""}`}
        />
      )}
    </div>
  );
});
