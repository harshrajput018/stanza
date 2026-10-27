import { describe, expect, it } from "vitest";
import { blocksToMarkdown, htmlToMd, markdownToBlocks, mdToHtml, sanitize } from "./markdown";

describe("sanitize", () => {
  it("keeps the inline allow-list and normalises synonyms", () => {
    expect(sanitize("<strong>a</strong> <em>b</em> <del>c</del> <code>d</code>")).toBe("<b>a</b> <i>b</i> <s>c</s> <code>d</code>");
  });
  it("strips scripts, styles, event handlers and unsafe links", () => {
    expect(sanitize('<span style="color:red" onclick="x()">hi</span><script>alert(1)</script>')).toBe("hi");
    expect(sanitize('<a href="javascript:alert(1)">x</a>')).toBe("x");
    expect(sanitize('<a href="https://ok.dev" target="_blank">x</a>')).toBe('<a href="https://ok.dev">x</a>');
  });
  it("escapes text and drops the browser's trailing <br>", () => {
    expect(sanitize("1 &lt; 2<br>")).toBe("1 &lt; 2");
  });
});

describe("inline markdown", () => {
  it("round-trips formatting", () => {
    const md = "**bold** _it_ ~~gone~~ `x < y` [link](https://a.dev)";
    expect(htmlToMd(mdToHtml(md))).toBe(md);
  });
  it("does not format inside inline code", () => {
    expect(mdToHtml("`**not bold**`")).toBe("<code>**not bold**</code>");
  });
  it("refuses javascript: links", () => {
    expect(mdToHtml("[x](javascript:alert(1))")).not.toContain("href");
  });
});

describe("blocks ⇄ markdown", () => {
  const md = ["# Title", "", "Para with **bold**", "", "- one", "  - nested", "1. first", "2. second", "- [x] done", "- [ ] todo", "", "> quoted", "", "---", "", "```", "const a = 1;", "  indented()", "```", ""].join("\n");

  it("parses every block type", () => {
    const blocks = markdownToBlocks(md);
    expect(blocks.map((b) => b.type)).toEqual(["h1", "p", "bullet", "bullet", "numbered", "numbered", "todo", "todo", "quote", "divider", "code"]);
    expect(blocks[3].indent).toBe(1);
    expect(blocks[6].checked).toBe(true);
    expect(blocks[10].html).toBe("const a = 1;\n  indented()");
  });

  it("serialises back to the same markdown", () => {
    expect(blocksToMarkdown(markdownToBlocks(md))).toBe(md);
  });

  it("restarts numbering after a non-list block", () => {
    const out = blocksToMarkdown(markdownToBlocks("1. a\n2. b\n\npara\n\n1. c"));
    expect(out).toContain("1. c");
  });
});
