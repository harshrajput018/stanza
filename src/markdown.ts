import { uid, type Block, type BlockType } from "./types";

const ALLOWED: Record<string, string> = { B: "b", STRONG: "b", I: "i", EM: "i", U: "u", S: "s", STRIKE: "s", DEL: "s", CODE: "code", A: "a", BR: "br" };

/** Elements whose content is never text the user meant to paste. */
const DROPPED = new Set(["SCRIPT", "STYLE", "TEMPLATE", "IFRAME", "OBJECT", "NOSCRIPT", "SVG", "HEAD", "TITLE", "META"]);

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const escapeAttr = (s: string) => escapeHtml(s).replace(/"/g, "&quot;");
const safeHref = (href: string) => (/^(https?:|mailto:|#|\/)/i.test(href.trim()) ? href.trim() : null);

/** Keeps only the inline tags the editor understands; everything else is reduced to its text. */
export function sanitize(html: string): string {
  const tpl = document.createElement("template");
  tpl.innerHTML = html;
  const walk = (node: Node): string => {
    let out = "";
    node.childNodes.forEach((child) => {
      if (child.nodeType === Node.TEXT_NODE) out += escapeHtml(child.textContent ?? "");
      else if (child.nodeType === Node.ELEMENT_NODE) {
        const el = child as HTMLElement;
        if (DROPPED.has(el.tagName.toUpperCase())) return;
        const tag = ALLOWED[el.tagName];
        const inner = walk(el);
        if (tag === "br") out += "<br>";
        else if (tag === "a") {
          const href = safeHref(el.getAttribute("href") ?? "");
          out += href ? `<a href="${escapeAttr(href)}">${inner}</a>` : inner;
        } else if (tag) out += inner ? `<${tag}>${inner}</${tag}>` : "";
        else out += inner;
      }
    });
    return out;
  };
  const result = walk(tpl.content);
  // A lone trailing <br> is the browser's placeholder for an empty line
  return result.replace(/<br>$/, "");
}

/** Plain text of inline HTML, with <br> as a newline. */
export function htmlToText(html: string): string {
  const tpl = document.createElement("template");
  tpl.innerHTML = html.replace(/<br\s*\/?>/gi, "\n");
  return tpl.content.textContent ?? "";
}

export { escapeHtml };

/** Inline HTML → Markdown. */
export function htmlToMd(html: string): string {
  const tpl = document.createElement("template");
  tpl.innerHTML = html;
  const walk = (node: Node): string => {
    let out = "";
    node.childNodes.forEach((child) => {
      if (child.nodeType === Node.TEXT_NODE) out += child.textContent;
      else if (child.nodeType === Node.ELEMENT_NODE) {
        const el = child as HTMLElement;
        const inner = walk(el);
        const wrap = (m: string) => (inner.trim() ? `${m}${inner}${m}` : inner);
        switch (el.tagName) {
          case "B": return void (out += wrap("**"));
          case "I": return void (out += wrap("_"));
          case "S": return void (out += wrap("~~"));
          case "U": return void (out += `<u>${inner}</u>`);
          case "CODE": return void (out += `\`${inner}\``);
          case "A": return void (out += `[${inner}](${el.getAttribute("href")})`);
          case "BR": return void (out += "  \n");
          default: out += inner;
        }
      }
    });
    return out;
  };
  return walk(tpl.content).replace(/ /g, " ");
}

/** Inline Markdown → sanitised HTML. */
export function mdToHtml(md: string): string {
  let s = escapeHtml(md);
  const codes: string[] = [];
  s = s.replace(/`([^`]+)`/g, (_, c) => `\u0000${codes.push(c) - 1}\u0000`);
  s = s
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, t, href) => (safeHref(href) ? `<a href="${escapeAttr(href)}">${t}</a>` : t))
    .replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>")
    .replace(/__([^_]+)__/g, "<b>$1</b>")
    .replace(/(^|[^*\w])\*([^*\s][^*]*)\*/g, "$1<i>$2</i>")
    .replace(/(^|[^_\w])_([^_\s][^_]*)_/g, "$1<i>$2</i>")
    .replace(/~~([^~]+)~~/g, "<s>$1</s>")
    .replace(/&lt;u&gt;(.*?)&lt;\/u&gt;/g, "<u>$1</u>");
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${codes[+i]}</code>`);
}

const PREFIX: Partial<Record<BlockType, string>> = { h1: "# ", h2: "## ", h3: "### ", bullet: "- ", quote: "> ", callout: "> 💡 " };

export function blocksToMarkdown(blocks: Block[], title?: string): string {
  const lines: string[] = title ? [`# ${title}`, ""] : [];
  const counters: number[] = [];
  blocks.forEach((b, i) => {
    const indent = "  ".repeat(b.indent ?? 0);
    const md = htmlToMd(b.html);
    if (b.type === "numbered") {
      const lvl = b.indent ?? 0;
      counters.length = lvl + 1;
      counters[lvl] = (counters[lvl] ?? 0) + 1;
    } else counters.length = 0;

    if (b.type === "code") lines.push("```", htmlToText(b.html).replace(/\n$/, ""), "```");
    else if (b.type === "divider") lines.push("---");
    else if (b.type === "todo") lines.push(`${indent}- [${b.checked ? "x" : " "}] ${md}`);
    else if (b.type === "numbered") lines.push(`${indent}${counters[b.indent ?? 0]}. ${md}`);
    else lines.push(`${b.type === "bullet" ? indent : ""}${PREFIX[b.type] ?? ""}${md}`);

    // Blank line between blocks, except inside a run of list items
    const next = blocks[i + 1];
    const isList = (t?: BlockType) => t === "bullet" || t === "numbered" || t === "todo";
    if (next && !(isList(b.type) && isList(next.type))) lines.push("");
  });
  return lines.join("\n").trim() + "\n";
}

export function markdownToBlocks(md: string): Block[] {
  const out: Block[] = [];
  const lines = md.replace(/\r\n?/g, "\n").split("\n");
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    if (!raw.trim()) continue;
    const indent = Math.min(3, Math.floor((raw.match(/^ */)![0].length) / 2));
    const line = raw.trim();
    const push = (type: BlockType, text: string, extra: Partial<Block> = {}) => out.push({ id: uid(), type, html: mdToHtml(text), ...extra });

    if (line.startsWith("```")) {
      const body: string[] = [];
      while (++i < lines.length && !lines[i].trim().startsWith("```")) body.push(lines[i]);
      out.push({ id: uid(), type: "code", html: escapeHtml(body.join("\n")) });
    } else if (/^(-{3,}|\*{3,})$/.test(line)) out.push({ id: uid(), type: "divider", html: "" });
    else if (line.startsWith("### ")) push("h3", line.slice(4));
    else if (line.startsWith("## ")) push("h2", line.slice(3));
    else if (line.startsWith("# ")) push("h1", line.slice(2));
    else if (/^[-*] \[( |x|X)\] /.test(line)) push("todo", line.slice(6), { checked: line[3] !== " ", indent });
    else if (/^[-*+] /.test(line)) push("bullet", line.slice(2), { indent });
    else if (/^\d+[.)] /.test(line)) push("numbered", line.replace(/^\d+[.)] /, ""), { indent });
    else if (line.startsWith("> 💡 ")) push("callout", line.slice(5));
    else if (line.startsWith("> ")) push("quote", line.slice(2));
    else push("p", line);
  }
  return out;
}
