import { describe, expect, it } from "vitest";

import {
  Converter,
  convert,
  convertNode,
  newBasePlugin,
  newCommonmarkPlugin,
  newStrikethroughPlugin,
  newTablePlugin,
  parse,
  renderHTML,
  RenderStatus,
  StringWriter,
  PriorityStandard,
  TagTypeBlock,
  type Plugin,
} from "../src/index.js";

describe("convert", () => {
  it("converts a simple string", () => {
    expect(convert("<strong>Bold Text</strong>")).toBe("**Bold Text**");
  });

  it("accepts commonmark options", () => {
    expect(convert("<em>x</em>", { commonmark: { emDelimiter: "_" } })).toBe("_x_");
  });

  it("resolves relative urls against a domain", () => {
    expect(convert('<img src="/assets/image.png" />', { domain: "https://example.com" })).toBe(
      "![](https://example.com/assets/image.png)",
    );
  });
});

describe("convertNode", () => {
  it("converts an already parsed document", () => {
    const doc = parse("<p>hello <b>world</b></p>");
    expect(convertNode(doc)).toBe("hello **world**");
  });
});

describe("Converter", () => {
  it("supports the table plugin", () => {
    const conv = new Converter({
      plugins: [newBasePlugin(), newCommonmarkPlugin(), newTablePlugin()],
    });
    const out = conv.convertString(
      "<table><tr><th>A</th></tr><tr><td>1</td></tr></table>",
    );
    expect(out).toBe("| A |\n|---|\n| 1 |");
  });

  it("supports the strikethrough plugin", () => {
    const conv = new Converter({
      plugins: [newBasePlugin(), newCommonmarkPlugin(), newStrikethroughPlugin()],
    });
    expect(conv.convertString("<del>gone</del>")).toBe("~~gone~~");
  });

  it("can disable escaping", () => {
    const conv = new Converter({
      plugins: [newBasePlugin(), newCommonmarkPlugin()],
      escapeMode: "disabled",
    });
    expect(conv.convertString("<p>1. not a list</p>")).toBe("1. not a list");
    expect(convert("<p>1. not a list</p>")).toBe("1\\. not a list");
  });

  it("throws when no plugins are registered", () => {
    expect(() => new Converter().convertString("<p>x</p>")).toThrow(/no render handlers/);
  });

  it("throws when commonmark is used without base", () => {
    const conv = new Converter({ plugins: [newCommonmarkPlugin()] });
    expect(() => conv.convertString("<p>x</p>")).toThrow(/"base" plugin is also required/);
  });

  it("reports invalid commonmark options on the first convert", () => {
    const conv = new Converter({
      plugins: [newBasePlugin(), newCommonmarkPlugin({ bulletListMarker: "?" })],
    });
    expect(() => conv.convertString("<p>x</p>")).toThrow(
      /error while initializing "commonmark" plugin: invalid value for BulletListMarker/,
    );
  });

  it("reports invalid table options on the first convert", () => {
    const conv = new Converter({
      plugins: [
        newBasePlugin(),
        newCommonmarkPlugin(),
        // @ts-expect-error -- deliberately invalid at runtime
        newTablePlugin({ spanCellBehavior: "random" }),
      ],
    });
    expect(() => conv.convertString("<p>x</p>")).toThrow(
      /error while initializing "table" plugin: unknown value "random" for span cell behavior/,
    );
  });

  it("lets a custom plugin register a renderer", () => {
    const shoutPlugin: Plugin = {
      name: () => "shout",
      init: (conv) => {
        conv.register.rendererFor(
          "shout",
          TagTypeBlock,
          (ctx, w, n) => {
            const inner = new StringWriter();
            ctx.renderChildNodes(inner, n);
            w.write("\n\n" + inner.toString().toUpperCase() + "\n\n");
            return RenderStatus.Success;
          },
          PriorityStandard,
        );
      },
    };

    const conv = new Converter({
      plugins: [newBasePlugin(), newCommonmarkPlugin(), shoutPlugin],
    });
    expect(conv.convertString("<shout>hello</shout>")).toBe("HELLO");
  });
});

describe("template contents", () => {
  // parse5 keeps the children of a <template> in a separate `content`
  // fragment, but Go's x/net/html leaves them as ordinary children. Walking
  // only childNodes silently dropped everything inside a template.
  it("converts the children of a template", () => {
    expect(convert("<p>before</p><template><p>inside</p></template><p>after</p>")).toBe(
      "before\n\ninside\n\nafter",
    );
  });

  it("converts a template nested in an element", () => {
    expect(convert("<div><template><em>i</em></template></div>")).toBe("*i*");
    expect(convert("<table><template><tr><td>c</td></tr></template></table>")).toBe("c");
  });

  it("keeps template contents in the parsed tree", () => {
    const doc = parse("<body><template><p>inside</p></template></body>");
    expect(renderHTML(doc)).toContain("<p>inside</p>");
  });

  // A template before any body content is parsed into <head>, whose contents
  // are dropped — Go does the same, so there is nothing to render here.
  it("renders nothing for a template that lands in head", () => {
    expect(convert("<template><p>inside</p></template>")).toBe("");
  });
});

describe("renderHTML", () => {
  it("serializes a parsed tree back to html", () => {
    const doc = parse("<p>a &amp; b</p>");
    expect(renderHTML(doc)).toContain("<p>a &amp; b</p>");
  });

  it("escapes comments the way Go does", () => {
    const doc = parse("<!--a & b-->");
    expect(renderHTML(doc)).toContain("<!--a &amp; b-->");
  });
});
