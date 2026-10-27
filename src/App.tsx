import { useEffect, useMemo, useRef, useState } from "react";
import Editor from "./Editor";
import { blocksToMarkdown, htmlToText, markdownToBlocks } from "./markdown";
import { demoDoc } from "./seed";
import type { Doc } from "./types";
import { useDocument } from "./useDocument";

const KEY = "stanza:doc:v1";
const ICONS = ["📝", "🚀", "📚", "🧠", "🌱", "🎯", "🛠️", "✨", "🗺️", "☕"];

function load(): Doc {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as Doc;
  } catch {
    /* storage unavailable: fall through to the demo */
  }
  return demoDoc();
}

const SHORTCUTS: [string, string][] = [
  ["/", "Command menu"],
  ["# ␣  ## ␣  ### ␣", "Headings"],
  ["- ␣   1. ␣   [] ␣", "Lists and to-dos"],
  ["> ␣   ```   ---", "Quote, code, divider"],
  ["⌘B ⌘I ⌘U ⌘E", "Bold, italic, underline, code"],
  ["⌘⇧S  ⌘K", "Strikethrough, link"],
  ["⌘⌥0–3", "Text / heading 1–3"],
  ["Tab  ⇧Tab", "Nest / un-nest list item"],
  ["⌘⇧↑  ⌘⇧↓", "Move block"],
  ["⌘D", "Duplicate block"],
  ["Esc", "Select block (then ↑↓ ⇧↑↓ ⌫)"],
  ["⌘Z  ⌘⇧Z", "Undo / redo"],
];

export default function App() {
  const store = useDocument(load);
  const { doc, commit } = store;
  const [status, setStatus] = useState<"saved" | "saving">("saved");
  const [help, setHelp] = useState(false);
  const [active, setActive] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Debounced autosave
  useEffect(() => {
    setStatus("saving");
    const t = window.setTimeout(() => {
      try {
        localStorage.setItem(KEY, JSON.stringify(doc));
      } catch {
        /* quota or privacy mode */
      }
      setStatus("saved");
    }, 400);
    return () => window.clearTimeout(t);
  }, [doc]);

  const flash = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast((t) => (t === msg ? null : t)), 1800);
  };

  const headings = useMemo(() => doc.blocks.filter((b) => b.type === "h1" || b.type === "h2" || b.type === "h3"), [doc.blocks]);
  const words = useMemo(() => doc.blocks.reduce((n, b) => n + (htmlToText(b.html).match(/\S+/g)?.length ?? 0), 0), [doc.blocks]);

  // Scroll-spy for the outline
  useEffect(() => {
    const els = headings.map((h) => document.querySelector(`[data-block-row="${h.id}"]`)).filter(Boolean) as Element[];
    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (visible) setActive(visible.target.getAttribute("data-block-row"));
      },
      { rootMargin: "-10% 0px -70% 0px" },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [headings]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "/") {
        e.preventDefault();
        setHelp((h) => !h);
      }
      if (e.key === "Escape") setHelp(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const markdown = () => blocksToMarkdown(doc.blocks, doc.title);

  const exportMd = () => {
    const url = URL.createObjectURL(new Blob([markdown()], { type: "text/markdown" }));
    Object.assign(document.createElement("a"), { href: url, download: `${(doc.title || "untitled").toLowerCase().replace(/[^a-z0-9]+/g, "-")}.md` }).click();
    URL.revokeObjectURL(url);
    flash("Downloaded Markdown");
  };

  const importMd = async (file: File) => {
    const text = await file.text();
    const titleMatch = text.match(/^# (.+)\n/);
    const blocks = markdownToBlocks(titleMatch ? text.slice(titleMatch[0].length) : text);
    commit({ icon: doc.icon, title: titleMatch?.[1] ?? file.name.replace(/\.md$/, ""), blocks: blocks.length ? blocks : demoDoc().blocks.slice(0, 1) });
    flash(`Imported ${blocks.length} blocks`);
  };

  const btn = "h-8 rounded-md px-2.5 text-sm text-muted transition hover:bg-hover hover:text-fg";

  return (
    <div className="min-h-dvh bg-bg text-fg">
      <header className="sticky top-0 z-40 flex h-12 items-center gap-2 border-b border-line/60 bg-bg/85 px-4 backdrop-blur">
        <span className="font-serif text-lg font-semibold italic tracking-tight">Stanza</span>
        <span className="text-muted">/</span>
        <span className="truncate text-sm">
          {doc.icon} {doc.title || "Untitled"}
        </span>
        <span className="ml-2 hidden text-xs text-muted sm:inline" aria-live="polite">
          {status === "saving" ? "Saving…" : "Saved locally"}
        </span>
        <div className="ml-auto flex items-center gap-0.5">
          <button type="button" className={btn} onClick={store.undo} disabled={!store.canUndo} title="Undo ⌘Z" aria-label="Undo">
            ↶
          </button>
          <button type="button" className={btn} onClick={store.redo} disabled={!store.canRedo} title="Redo ⌘⇧Z" aria-label="Redo">
            ↷
          </button>
          <button type="button" className={btn} onClick={() => navigator.clipboard?.writeText(markdown()).then(() => flash("Copied as Markdown"), () => flash("Clipboard blocked"))}>
            Copy MD
          </button>
          <button type="button" className={`${btn} hidden sm:block`} onClick={() => fileRef.current?.click()}>
            Import
          </button>
          <input ref={fileRef} type="file" accept=".md,.markdown,.txt,text/markdown" hidden onChange={(e) => e.target.files?.[0] && importMd(e.target.files[0])} />
          <button type="button" className={btn} onClick={exportMd}>
            Export
          </button>
          <button type="button" className={btn} onClick={() => setHelp(true)} aria-label="Keyboard shortcuts" title="Shortcuts ⌘/">
            ⌘/
          </button>
        </div>
      </header>

      <div className="mx-auto flex max-w-6xl gap-10 px-5 sm:px-16">
        <main className="min-w-0 max-w-[720px] flex-1 pb-24 pt-14">
          <button
            type="button"
            aria-label="Change page icon"
            title="Change icon"
            onClick={() => commit((d) => ({ ...d, icon: ICONS[(ICONS.indexOf(d.icon) + 1) % ICONS.length] }))}
            className="-ml-1 mb-3 rounded-lg p-1 text-[56px] leading-none transition hover:bg-hover"
          >
            {doc.icon}
          </button>
          <Editor store={store} />
          <p className="mt-2 text-xs text-muted">
            {words.toLocaleString()} words · {Math.max(1, Math.round(words / 230))} min read · {doc.blocks.length} blocks
          </p>
        </main>

        {headings.length > 1 && (
          <nav aria-label="On this page" className="sticky top-12 hidden h-fit max-h-[calc(100dvh-3rem)] w-52 shrink-0 overflow-y-auto pt-40 xl:block">
            <p className="mb-3 text-[11px] font-medium uppercase tracking-wide text-muted">On this page</p>
            <ul className="space-y-1 border-l border-line text-sm">
              {headings.map((h) => (
                <li key={h.id}>
                  <button
                    type="button"
                    onClick={() => document.querySelector(`[data-block-row="${h.id}"]`)?.scrollIntoView({ behavior: "smooth", block: "start" })}
                    className={`-ml-px block w-full truncate border-l py-0.5 text-left transition ${h.type === "h3" ? "pl-6" : h.type === "h2" ? "pl-4" : "pl-3"} ${
                      active === h.id ? "border-accent text-fg" : "border-transparent text-muted hover:text-fg"
                    }`}
                  >
                    {htmlToText(h.html) || "Untitled"}
                  </button>
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={() => {
                if (confirm("Replace this page with the original demo?")) commit(demoDoc());
              }}
              className="mt-8 text-xs text-muted underline-offset-4 hover:text-fg hover:underline"
            >
              Reset demo page
            </button>
          </nav>
        )}
      </div>

      {help && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4 backdrop-blur-sm" onClick={() => setHelp(false)}>
          <div role="dialog" aria-modal="true" aria-labelledby="help-title" className="w-full max-w-md rounded-2xl border border-line bg-panel p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 id="help-title" className="text-lg font-semibold">
                Keyboard shortcuts
              </h2>
              <button type="button" autoFocus onClick={() => setHelp(false)} className="rounded-md px-2 py-1 text-sm text-muted hover:bg-hover" aria-label="Close">
                Esc
              </button>
            </div>
            <dl className="mt-4 divide-y divide-line text-sm">
              {SHORTCUTS.map(([k, v]) => (
                <div key={k} className="flex items-center justify-between gap-4 py-2">
                  <dt className="text-muted">{v}</dt>
                  <dd className="font-mono text-xs">{k}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      )}

      <div role="status" aria-live="polite" className="pointer-events-none fixed bottom-6 left-1/2 z-50 -translate-x-1/2">
        {toast && <div className="rounded-lg bg-fg px-3 py-2 text-sm text-bg shadow-lg">{toast}</div>}
      </div>
    </div>
  );
}
