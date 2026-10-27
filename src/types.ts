export type BlockType = "p" | "h1" | "h2" | "h3" | "bullet" | "numbered" | "todo" | "quote" | "code" | "callout" | "divider";

export type Block = {
  id: string;
  type: BlockType;
  /** Sanitised inline HTML: only b, i, u, s, code, a and br survive. */
  html: string;
  checked?: boolean;
  indent?: number;
};

export type Doc = { icon: string; title: string; blocks: Block[] };

export const LIST_TYPES: BlockType[] = ["bullet", "numbered", "todo"];
export const TEXTLESS: BlockType[] = ["divider"];

export const uid = () => Math.random().toString(36).slice(2, 10);
