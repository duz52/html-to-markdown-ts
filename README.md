# html-to-markdown-ts

[![npm](https://img.shields.io/npm/v/html-to-markdown-ts.svg)](https://www.npmjs.com/package/html-to-markdown-ts)
[![license](https://img.shields.io/npm/l/html-to-markdown-ts.svg)](./LICENSE)
[![Buy Me a Coffee](https://img.shields.io/badge/Buy%20Me%20a%20Coffee-support-FFDD00?logo=buymeacoffee&logoColor=black)](https://buymeacoffee.com/duz52)

Convert HTML to Markdown. A TypeScript port of the Go library
[JohannesKaufmann/html-to-markdown](https://github.com/JohannesKaufmann/html-to-markdown),
using [parse5](https://github.com/inikulin/parse5) as the HTML parser.

The port is verified against the Go implementation: the upstream golden files
and a corpus of ~95 cases across the option surface are asserted to produce
byte-identical output. See [Verifying the port](#verifying-the-port).

## Install

```bash
npm install html-to-markdown-ts
```

Ships ESM and CommonJS builds with TypeScript types. Requires Node 18+.
The only runtime dependency is `parse5`.

## Usage

```ts
import { convert } from "html-to-markdown-ts";

convert("<strong>Bold Text</strong>");
// "**Bold Text**"
```

Relative URLs can be resolved against a base domain:

```ts
convert('<img src="/assets/image.png" />', { domain: "https://example.com" });
// "![](https://example.com/assets/image.png)"
```

### Options

`convert` takes commonmark options through the `commonmark` key:

```ts
convert("<em>x</em>", { commonmark: { emDelimiter: "_" } });
// "_x_"
```

| Option | Values | Default |
| --- | --- | --- |
| `emDelimiter` | `"*"`, `"_"` | `"*"` |
| `strongDelimiter` | `"**"`, `"__"` | `"**"` |
| `horizontalRule` | any thematic break | `"* * *"` |
| `bulletListMarker` | `"-"`, `"+"`, `"*"` | `"-"` |
| `codeBlockFence` | `` "```" ``, `"~~~"` | `` "```" `` |
| `headingStyle` | `"atx"`, `"setext"` | `"atx"` |
| `listEndComment` | `boolean` | `true` |
| `linkEmptyHrefBehavior` | `"render"`, `"skip"` | `"render"` |
| `linkEmptyContentBehavior` | `"render"`, `"skip"` | `"render"` |

### Tables and strikethrough

`convert` registers the base and commonmark plugins. For anything else, build
a `Converter` with the plugins you need:

```ts
import {
  Converter,
  newBasePlugin,
  newCommonmarkPlugin,
  newTablePlugin,
  newStrikethroughPlugin,
} from "html-to-markdown-ts";

const converter = new Converter({
  plugins: [
    newBasePlugin(),
    newCommonmarkPlugin(),
    newTablePlugin(),
    newStrikethroughPlugin(),
  ],
});

converter.convertString(html);
```

The `base` plugin is always required, and `commonmark` depends on it.

Table options:

| Option | Values | Default |
| --- | --- | --- |
| `cellPaddingBehavior` | `"aligned"`, `"minimal"`, `"none"` | `"aligned"` |
| `spanCellBehavior` | `"empty"`, `"mirror"` | `"empty"` |
| `newlineBehavior` | `"skip"`, `"preserve"` | `"skip"` |
| `skipEmptyRows` | `boolean` | `false` |
| `headerPromotion` | `boolean` | `false` |
| `presentationTables` | `boolean` | `false` |

`"aligned"` pads cells using **terminal display width**, not character count,
so CJK text, emoji and combining characters still line up:

```
| Name | Value |
|------|-------|
| 名稱 | 1     |
| abc  | 2     |
```

### Escaping

Characters with a special markdown meaning are escaped so they render
literally. Escaping is context-aware: a `-` only becomes `\-` where it would
actually start a list.

```ts
convert("<p>1. not a list</p>");
// "1\\. not a list"
```

Set `escapeMode: "disabled"` on the `Converter` to turn it off entirely.

### Working with a parsed tree

```ts
import { parse, convertNode } from "html-to-markdown-ts";

const doc = parse("<p>hello <b>world</b></p>");
convertNode(doc); // "hello **world**"
```

Note that conversion **mutates** the tree — the pre-render passes rewrite it
in place. Re-parse if you need the original.

### Custom plugins

```ts
import {
  Converter,
  RenderStatus,
  StringWriter,
  TagTypeBlock,
  PriorityStandard,
  type Plugin,
} from "html-to-markdown-ts";

const shout: Plugin = {
  name: () => "shout",
  init: (conv) => {
    conv.register.rendererFor("shout", TagTypeBlock, (ctx, w, node) => {
      const inner = new StringWriter();
      ctx.renderChildNodes(inner, node);
      w.write("\n\n" + inner.toString().toUpperCase() + "\n\n");
      return RenderStatus.Success;
    }, PriorityStandard);
  },
};
```

Handlers run in priority order (`PriorityEarly` 100, `PriorityStandard` 500,
`PriorityLate` 1000) and can be registered for the pre-render, render,
post-render, text-transform and un-escape phases.

## Verifying the port

Output parity with Go is tested three ways:

- **Golden files** — the `.in.html` / `.out.md` fixtures are copied verbatim
  from the Go repository's `testdata` and must match byte-for-byte.
- **Differential corpus** — `test/corpus/cases.json` is run through the *Go*
  library by `scripts/gen-corpus-expectations.go`, and the port is asserted
  against those outputs. This covers the option surface the golden files miss
  (setext headings, alternate delimiters, escape modes, domains, and every
  table option).
- **Display width** — `scripts/gen-width-corpus.go` records
  `uniseg.StringWidth` for 5,000+ strings, including a sweep of the code point
  space, and the TypeScript `stringWidth` must agree on all of them.

To regenerate the expectations you need Go and a checkout of the upstream
library; the scripts carry usage instructions in their headers.

```bash
npm test          # run everything
npm run typecheck
npm run build
```

## Differences from the Go library

Behavior matches Go except where the runtime forces a difference:

- **No CLI.** Only the library is ported.
- **Strings instead of bytes.** Go operates on `[]byte`; this port uses
  JavaScript strings throughout. For the escaping logic this is equivalent,
  because every character it inspects is ASCII.
- **Whitespace after a list marker.** Go checks a single *byte* against a
  small whitespace set, which incidentally matches the trailing byte of some
  multi-byte characters. This port compares actual characters instead.
- **Handler ordering.** Go sorts handlers with `sort.Slice`, which is not
  stable; `Array.prototype.sort` is. In practice both preserve registration
  order for equal priorities.
- **Naming.** Go's `WithX` option functions become plain option objects, and
  exported names follow TypeScript conventions (`newTablePlugin`,
  `cellDisplayWidth`).

## Credits

All conversion logic and the design of the plugin pipeline come from
[Johannes Kaufmann's Go library](https://github.com/JohannesKaufmann/html-to-markdown).
The whitespace collapsing traces further back to
[turndown](https://github.com/mixmark-io/turndown) by Dom Christie and
[collapse-whitespace](https://github.com/wooorm/collapse-white-space) by Luc
Thevenard.

## Support

If this library saves you some time, you can
[buy me a coffee](https://buymeacoffee.com/duz52). Much appreciated, and
entirely optional.

## License

MIT — see [LICENSE](./LICENSE).
