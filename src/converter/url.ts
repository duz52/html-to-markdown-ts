/**
 * URL handling — resolving relative URLs against a base domain and
 * percent-encoding the characters that would otherwise break markdown link
 * syntax.
 */

const percentEncodings: ReadonlyArray<readonly [string, string]> = [
  [" ", "%20"],
  ["[", "%5B"],
  ["]", "%5D"],
  ["(", "%28"],
  [")", "%29"],
  ["<", "%3C"],
  [">", "%3E"],
];

function percentEncode(s: string): string {
  let out = s;
  for (const [from, to] of percentEncodings) {
    out = out.replaceAll(from, to);
  }
  return out;
}

/**
 * True if the url starts with a scheme ("https:", "mailto:", "data:").
 * Without one, `new URL(url)` can only succeed when a base is supplied, so
 * this check lets us skip a guaranteed-to-throw constructor call — exceptions
 * are expensive enough to dominate documents with many relative links.
 */
function hasScheme(url: string): boolean {
  for (let i = 0; i < url.length; i++) {
    const c = url.charCodeAt(i);
    if (c === 0x3a /* ":" */) {
      return i > 0;
    }
    const isAlpha = (c >= 0x61 && c <= 0x7a) || (c >= 0x41 && c <= 0x5a);
    if (isAlpha) {
      continue;
    }
    const isSchemeTail =
      i > 0 && ((c >= 0x30 && c <= 0x39) || c === 0x2b || c === 0x2d || c === 0x2e);
    if (!isSchemeTail) {
      return false;
    }
  }
  return false;
}

// The base domain is fixed for a whole conversion, so parsing it once and
// reusing the result avoids re-running the URL parser for every single link.
let cachedDomain: string | undefined;
let cachedBase: URL | null = null;

function parseBaseDomain(rawDomain: string): URL | null {
  if (rawDomain === "") {
    return null;
  }
  if (rawDomain === cachedDomain) {
    return cachedBase;
  }
  const parsed = parseBaseDomainUncached(rawDomain);
  cachedDomain = rawDomain;
  cachedBase = parsed;
  return parsed;
}

function parseBaseDomainUncached(rawDomain: string): URL | null {

  try {
    const u = new URL(rawDomain);
    if (u.host !== "") {
      // Yes, we got a valid domain (probably with a http/https scheme)
      return u;
    }
  } catch {
    // Fall through and try again with a scheme.
  }

  try {
    const u = new URL("http://" + rawDomain);
    if (u.host !== "") {
      // Yes, we got a valid domain (by choosing a fallback scheme)
      return u;
    }
  } catch {
    // Not a domain at all.
  }

  return null;
}

function decodeAndEncode(original: string): string {
  let decoded: string;
  try {
    // Go's url.QueryUnescape also turns "+" into a space.
    decoded = decodeURIComponent(original.replaceAll("+", " "));
  } catch {
    return original;
  }
  // Go's url.QueryEscape encodes a space as "+"; the caller turns it into %20.
  return encodeURIComponent(decoded)
    .replaceAll("%20", "+")
    .replaceAll("!", "%21")
    .replaceAll("'", "%27")
    .replaceAll("(", "%28")
    .replaceAll(")", "%29")
    .replaceAll("*", "%2A")
    .replaceAll("~", "%7E");
}

/**
 * Re-encodes a query string while keeping the original parameter order.
 * (Serializing through URLSearchParams would sort and normalize them.)
 */
export function parseAndEncodeQuery(rawQuery: string): string {
  if (rawQuery === "") {
    return "";
  }

  return rawQuery
    .split("&")
    .map((part) => {
      const eq = part.indexOf("=");
      if (eq === -1) {
        // A: Just the key
        return decodeAndEncode(part);
      }
      const key = part.slice(0, eq);
      const value = part.slice(eq + 1);
      if (value === "") {
        // B: The key and the equal sign
        return decodeAndEncode(key) + "=";
      }
      // C: The key and the equal sign and the value
      return decodeAndEncode(key) + "=" + decodeAndEncode(value);
    })
    .join("&");
}

/**
 * Turns a possibly relative URL into the string that goes into the markdown
 * link. If a domain is configured, relative URLs are resolved against it.
 */
export function defaultAssembleAbsoluteURL(
  _tagName: string,
  rawURL: string,
  domain: string,
): string {
  let url = rawURL.trim();

  if (url === "#") {
    // An empty fragment is indistinguishable from no fragment once parsed,
    // so return it untouched.
    return url;
  }

  // Increase the chance that the url will be parsed
  url = url.replaceAll("\n", "%0A").replaceAll("\t", "%09");

  const base = parseBaseDomain(domain);

  if (base === null && !hasScheme(url)) {
    // A relative url with no domain configured: `new URL` would throw, so
    // take the same path the catch below does without paying for the throw.
    return percentEncode(encodeRelative(url));
  }

  let parsed: URL;
  try {
    parsed = base === null ? new URL(url) : new URL(url, base);
  } catch {
    // We can't do anything with this url because it is invalid (or it is a
    // relative url and no domain was configured).
    return percentEncode(encodeRelative(url));
  }

  if (parsed.protocol === "data:") {
    // This is a data uri (for example an inline base64 image)
    return percentEncode(url);
  }

  // Keep the original parameter order, but still encode the parameters.
  const query = parseAndEncodeQuery(parsed.search.replace(/^\?/, ""));
  // For better compatibility (especially for mailto links) encode a space
  // as "%20" rather than "+", so that an email body reads "Hi Johannes"
  // instead of "Hi+Johannes".
  parsed.search = query === "" ? "" : "?" + query.replaceAll("+", "%20");

  let result = parsed.href;
  if (query === "" && url.includes("?") && !result.includes("?")) {
    // Preserve a trailing "?" that carried no parameters.
    result += "?";
  }

  return percentEncode(result);
}

/**
 * When there is no base domain, a relative URL stays relative. Only the query
 * part is normalized, matching what Go's url.Parse + String() produces.
 */
function encodeRelative(url: string): string {
  const queryStart = url.indexOf("?");
  if (queryStart === -1) {
    return url;
  }

  const path = url.slice(0, queryStart);
  const rest = url.slice(queryStart + 1);

  const fragmentStart = rest.indexOf("#");
  const rawQuery = fragmentStart === -1 ? rest : rest.slice(0, fragmentStart);
  const fragment = fragmentStart === -1 ? "" : rest.slice(fragmentStart);

  const query = parseAndEncodeQuery(rawQuery).replaceAll("+", "%20");

  return path + "?" + query + fragment;
}
