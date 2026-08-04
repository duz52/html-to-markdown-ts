//go:build ignore

package main

import (
	"fmt"
	"os"
	"strings"
	"unicode/utf8"

	"github.com/rivo/uniseg"
)

type rng struct{ lo, hi int }

func collect(target int) []rng {
	var out []rng
	var cur *rng
	for cp := 0; cp <= 0x10FFFF; cp++ {
		if cp >= 0xD800 && cp <= 0xDFFF {
			// Surrogates are not valid scalar values.
			if cur != nil {
				out = append(out, *cur)
				cur = nil
			}
			continue
		}
		r := rune(cp)
		if !utf8.ValidRune(r) {
			continue
		}
		w := uniseg.StringWidth(string(r))
		if w == target {
			if cur == nil {
				cur = &rng{cp, cp}
			} else {
				cur.hi = cp
			}
		} else if cur != nil {
			out = append(out, *cur)
			cur = nil
		}
	}
	if cur != nil {
		out = append(out, *cur)
	}
	return out
}

func format(name string, ranges []rng) string {
	var b strings.Builder
	fmt.Fprintf(&b, "const %s: ReadonlyArray<readonly [number, number]> = [\n", name)
	for _, r := range ranges {
		fmt.Fprintf(&b, "  [0x%04X, 0x%04X],\n", r.lo, r.hi)
	}
	b.WriteString("];\n")
	return b.String()
}

func main() {
	// Sanity check: fail loudly if uniseg ever returns a width this generator
	// does not know how to encode.
	seen := map[int]bool{}
	for cp := 0; cp <= 0x10FFFF; cp++ {
		if cp >= 0xD800 && cp <= 0xDFFF {
			continue
		}
		seen[uniseg.StringWidth(string(rune(cp)))] = true
	}
	for w := range seen {
		if w != 0 && w != 1 && w != 2 && w != 3 && w != 4 {
			panic(fmt.Sprintf("unexpected rune width %d", w))
		}
	}

	zero := collect(0)
	wide := collect(2)
	// uniseg gives the two-em and three-em dash a width of 3 and 4.
	w3 := collect(3)
	w4 := collect(4)

	fmt.Fprintf(os.Stderr, "ranges — zero: %d, wide: %d, w3: %d, w4: %d\n",
		len(zero), len(wide), len(w3), len(w4))

	fmt.Print(format("ZERO_WIDTH", zero))
	fmt.Println()
	fmt.Print(format("WIDE", wide))
	fmt.Println()
	fmt.Print(format("WIDTH_3", w3))
	fmt.Println()
	fmt.Print(format("WIDTH_4", w4))
}
