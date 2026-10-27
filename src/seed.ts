import { markdownToBlocks } from "./markdown";
import type { Doc } from "./types";

const DEMO = `
Stanza is a block editor built from scratch: no ProseMirror, Slate, Lexical or TipTap. Every block is its own \`contentEditable\`, and the document is a plain array the app owns. Try editing anything on this page.

## Try these
- [ ] Type **/** on an empty line to open the command menu
- [ ] Start a line with **#**, **-**, **1.**, **[]**, **>** or three backticks to change its type
- [ ] Select some text to **format** it, or use ⌘B, ⌘I, ⌘U, ⌘E and ⌘K
- [ ] Hover a block and drag the ⋮⋮ handle to reorder it
- [x] Press ⌘Z: undo works across splits, merges and moves, not just typing

## How it works
1. Each block keeps its own DOM while you type. React only rewrites a block when the model changes from outside: undo, paste, merge.
2. Caret positions are stored as plain-text offsets, so they survive re-renders and undo.
3. Inline HTML is sanitised to a small allow-list: b, i, u, s, code, a and br.
  1. Pasted HTML can't inject styles or scripts.
  2. Pasting multi-line Markdown creates real blocks.

> 💡 Press Esc to select the current block, then use ↑ ↓, ⇧↑, ⌫, ⌘D or ⌘⇧↑ to work with whole blocks.

## Keyboard
- **Enter** splits a block at the caret; **Backspace** at the start merges it into the one above
- **Tab / Shift-Tab** nest and un-nest list items
- **↑ / ↓** move between blocks and keep the caret's horizontal position
- **⌘⌥1–3** turn a block into a heading; **⌘⌥0** back to text

> Good editors disappear. You should only notice this one when it does something nice.

---

\`\`\`
// The whole document is just data
type Block = { id: string; type: BlockType; html: string; checked?: boolean; indent?: number };
\`\`\`

Everything saves to this browser automatically. Use **Export** to download Markdown.
`;

export function demoDoc(): Doc {
  return { icon: "📝", title: "Welcome to Stanza", blocks: markdownToBlocks(DEMO) };
}
