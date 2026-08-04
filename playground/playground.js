// The playground loads the published package straight from jsDelivr, so this
// page stays plain static files with no build step. `+esm` asks jsDelivr for a
// browser-ready ES module with parse5 already bundled in.
//
// Bump VERSION when you release. It is shown in the footer so that anyone
// filing a bug report knows which version they were looking at.
const VERSION = "0.1.0";
const MODULE_URL = `https://cdn.jsdelivr.net/npm/html-to-markdown-ts@${VERSION}/+esm`;

const $ = (id) => document.getElementById(id);

const el = {
  input: $("input"),
  output: $("output"),
  outWrap: $("out-wrap"),
  inMeta: $("in-meta"),
  outMeta: $("out-meta"),
  samples: $("samples"),
  toast: $("toast"),
  ruler: $("ruler"),
  tableGroup: $("table-group"),
};

// Every control that feeds the converter, with the default it resets to.
const controls = {
  "p-table": true,
  "p-strike": false,
  "c-heading": "atx",
  "c-em": "*",
  "c-strong": "**",
  "c-bullet": "-",
  "c-fence": "```",
  "c-emptyhref": "render",
  "c-emptycontent": "render",
  "c-listcomment": true,
  "t-padding": "aligned",
  "t-span": "empty",
  "t-newline": "skip",
  "t-empty": false,
  "t-promote": false,
  "t-presentation": false,
  "x-escape": "smart",
  "x-domain": "",
};

const SAMPLES = {
  table: `<table>
  <tr><th>Name</th><th>Value</th><th>Note</th></tr>
  <tr><td>名稱</td><td>1</td><td>CJK is two columns wide</td></tr>
  <tr><td>😊</td><td>2</td><td>so is an emoji</td></tr>
  <tr><td>abc</td><td>3</td><td>plain ascii</td></tr>
</table>`,
  formatting: `<h1>A heading</h1>
<p>Some <strong>bold</strong> and <em>italic</em> text, plus
<code>inline code</code> and a <a href="/page" title="the title">link</a>.</p>
<blockquote>A quote that spans<br />two lines.</blockquote>
<hr />
<p>1. This is not a list, so the dot gets escaped.</p>`,
  lists: `<ol start="8">
  <li>eight</li>
  <li>nine
    <ul>
      <li>nested</li>
      <li>items</li>
    </ul>
  </li>
  <li>ten</li>
</ol>
<ul><li>a separate list</li></ul>`,
  code: `<pre><code class="language-ts">const md = convert("&lt;b&gt;hi&lt;/b&gt;");
console.log(md);
</code></pre>
<p>Inline <code>code with \` backtick</code> too.</p>`,
  spans: `<table>
  <tr><th>Quarter</th><th>Region</th><th>Total</th></tr>
  <tr><td rowspan="2">Q1</td><td>North</td><td>120</td></tr>
  <tr><td>South</td><td>90</td></tr>
  <tr><td colspan="3">Full year pending</td></tr>
</table>`,
  messy: `<div><span><div>a span holding a block</div></span></div>
<h2><blockquote>a quote inside a heading</blockquote></h2>
<ul>stray text before any item<li>an actual item</li></ul>
<a href="/x"><h3>a heading inside a link</h3></a>`,
};

let lib = null;

// - - - - - - - - - - - - - Reading the controls - - - - - - - - - - - - - //

function readState() {
  const state = {};
  for (const id of Object.keys(controls)) {
    const node = $(id);
    state[id] = node.type === "checkbox" ? node.checked : node.value;
  }
  state.input = el.input.value;
  return state;
}

function applyState(state) {
  for (const [id, fallback] of Object.entries(controls)) {
    const node = $(id);
    const value = state[id] ?? fallback;
    if (node.type === "checkbox") {
      node.checked = Boolean(value);
    } else {
      node.value = String(value);
    }
  }
  if (typeof state.input === "string") {
    el.input.value = state.input;
  }
}

function buildConverter(state) {
  const plugins = [lib.newBasePlugin(), lib.newCommonmarkPlugin({
    headingStyle: state["c-heading"],
    emDelimiter: state["c-em"],
    strongDelimiter: state["c-strong"],
    bulletListMarker: state["c-bullet"],
    codeBlockFence: state["c-fence"],
    linkEmptyHrefBehavior: state["c-emptyhref"],
    linkEmptyContentBehavior: state["c-emptycontent"],
    listEndComment: state["c-listcomment"],
  })];

  if (state["p-table"]) {
    plugins.push(lib.newTablePlugin({
      cellPaddingBehavior: state["t-padding"],
      spanCellBehavior: state["t-span"],
      newlineBehavior: state["t-newline"],
      skipEmptyRows: state["t-empty"],
      headerPromotion: state["t-promote"],
      presentationTables: state["t-presentation"],
    }));
  }
  if (state["p-strike"]) {
    plugins.push(lib.newStrikethroughPlugin());
  }

  return new lib.Converter({ plugins, escapeMode: state["x-escape"] });
}

// - - - - - - - - - - - - - Converting - - - - - - - - - - - - - //

function convert() {
  if (lib === null) return;

  const state = readState();
  el.tableGroup.classList.toggle("group--off", !state["p-table"]);

  let markdown = "";
  let failed = false;
  try {
    markdown = buildConverter(state).convertString(state.input, {
      domain: state["x-domain"].trim(),
    });
  } catch (err) {
    failed = true;
    markdown = err instanceof Error ? err.message : String(err);
  }

  el.output.textContent = markdown;
  el.output.classList.toggle("out__body--error", failed);

  const inLines = state.input === "" ? 0 : state.input.split("\n").length;
  el.inMeta.textContent = `${inLines} ${inLines === 1 ? "line" : "lines"}`;

  if (failed) {
    el.outMeta.textContent = "conversion failed — see the message above";
    el.outMeta.classList.add("pane__foot--error");
    return;
  }
  el.outMeta.classList.remove("pane__foot--error");

  // The widest line is measured with the library's own stringWidth, which is
  // what the table renderer uses to line columns up. It counts a CJK
  // character as two columns and a ZWJ emoji sequence as two, not seven.
  const lines = markdown === "" ? [] : markdown.split("\n");
  let widest = 0;
  for (const line of lines) {
    const w = lib.stringWidth(line);
    if (w > widest) widest = w;
  }

  el.outMeta.innerHTML =
    `<span>${lines.length} ${lines.length === 1 ? "line" : "lines"}</span>` +
    `<span>${markdown.length} chars</span>` +
    `<span class="pane__foot-key">widest line ${widest} cols</span>`;
}

// - - - - - - - - - - - - - Chrome - - - - - - - - - - - - - //

let toastTimer;
function toast(message) {
  el.toast.textContent = message;
  el.toast.classList.add("toast--on");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.toast.classList.remove("toast--on"), 1800);
}

function setRuler(on) {
  el.outWrap.classList.toggle("out--ruled", on);
}

function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  $("theme-glyph").textContent = theme === "dark" ? "◑" : "◐";
  try {
    localStorage.setItem("h2m-theme", theme);
  } catch {
    // Private browsing; the theme just will not persist.
  }
}

// - - - - - - - - - - - - - Shareable links - - - - - - - - - - - - - //

function encodeState(state) {
  const json = JSON.stringify(state);
  const bytes = new TextEncoder().encode(json);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function decodeState(encoded) {
  const base64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64);
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}

// - - - - - - - - - - - - - Wiring - - - - - - - - - - - - - //

function buildSampleButtons() {
  for (const name of Object.keys(SAMPLES)) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "btn btn--quiet";
    button.textContent = name;
    button.addEventListener("click", () => {
      el.input.value = SAMPLES[name];
      convert();
    });
    el.samples.append(button);
  }
}

function wire() {
  for (const id of Object.keys(controls)) {
    const node = $(id);
    node.addEventListener(node.tagName === "SELECT" ? "change" : "input", convert);
  }
  el.input.addEventListener("input", convert);

  el.ruler.addEventListener("change", () => setRuler(el.ruler.checked));

  $("reset").addEventListener("click", () => {
    applyState({});
    convert();
    toast("Options reset");
  });

  $("copy").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(el.output.textContent ?? "");
      toast("Markdown copied");
    } catch {
      toast("Could not reach the clipboard");
    }
  });

  $("share").addEventListener("click", async () => {
    const url = `${location.origin}${location.pathname}#s=${encodeState(readState())}`;
    history.replaceState(null, "", url);
    try {
      await navigator.clipboard.writeText(url);
      toast("Link copied");
    } catch {
      toast("Link is in the address bar");
    }
  });

  $("theme").addEventListener("click", () => {
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    setTheme(next);
  });
}

function restore() {
  const hash = location.hash.match(/^#s=(.+)$/);
  if (hash) {
    try {
      applyState(decodeState(hash[1]));
      return;
    } catch {
      // A malformed link should not leave an empty page.
    }
  }
  applyState({});
  el.input.value = SAMPLES.table;
}

function showLoadFailure(error) {
  el.output.textContent =
    `Could not load html-to-markdown-ts@${VERSION} from jsDelivr.\n\n` +
    `${error}\n\n` +
    `If the package has not been published yet, this page has nothing to run. ` +
    `Publish it, then bump VERSION in playground.js.`;
  el.output.classList.add("out__body--error");
  el.outMeta.textContent = "library unavailable";
  el.outMeta.classList.add("pane__foot--error");
}

async function main() {
  let stored = null;
  try {
    stored = localStorage.getItem("h2m-theme");
  } catch {
    // Ignore; fall through to the system preference.
  }
  setTheme(stored ?? (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"));

  $("version").textContent = `html-to-markdown-ts@${VERSION}`;
  buildSampleButtons();
  restore();
  wire();
  setRuler(el.ruler.checked);

  try {
    lib = await import(/* @vite-ignore */ MODULE_URL);
  } catch (error) {
    showLoadFailure(error);
    return;
  }

  document.body.classList.add("is-ready");
  convert();
}

main();
