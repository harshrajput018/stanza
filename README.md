# Stanza: a Notion-style block editor, from scratch

A block editor in **React + TypeScript with no editor framework**: no ProseMirror, Slate, Lexical or TipTap. Each block is its own `contentEditable`; the document is a plain array the app owns.

## What's in it
- **Slash command menu** (`/`) with fuzzy filtering and keyboard navigation.
- **Markdown shortcuts**: `#`, `##`, `###`, `-`, `1.`, `[]`, `>`, three backticks and `---`.
- **Block types**: text, headings, bulleted, numbered and to-do lists (nestable with Tab), quote, callout, code and divider.
- **Inline formatting** from a floating toolbar or ⌘B / ⌘I / ⌘U / ⌘E / ⌘⇧S / ⌘K, with links.
- **Real editing semantics.** Enter splits a block at the caret and keeps inline formatting on both sides. Backspace at the start merges into the block above. ↑/↓ cross block boundaries and keep the caret's horizontal position.
- **Drag to reorder** with a drop indicator, plus a block menu (turn into, duplicate, move, delete).
- **Block selection mode**: Esc selects the block, then ↑↓, ⇧↑↓, ⌫, ⌘D, ⌘C and ⌘⇧↑↓ work on whole blocks.
- **Custom undo/redo** that works across splits, merges and moves, not just typing, with keystrokes coalesced into steps.
- **Paste**: multi-line Markdown becomes real blocks, and pasting a URL over selected text makes a link. Pasted HTML is sanitised to an allow-list.
- **Markdown import and export**, autosave, a scroll-spy outline and word count.

## How it works
- **No DOM writes while typing.** A block only rewrites its DOM when the model changed from outside (undo, paste, merge). Re-rendering while typing is what makes most hand-rolled editors lose the caret.
- **Caret positions are plain-text offsets**, so focus can be restored after any re-render or undo.
- **`sanitize()`** reduces any HTML to `b i u s code a br` and drops script and style content.

## Run
```bash
npm install
npm run dev
npm test        # sanitiser + markdown round-trip tests
npm run build
```
