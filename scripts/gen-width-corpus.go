//go:build ignore

// Generates test/corpus/widths.json by running a set of strings through
// `uniseg.StringWidth` from the Go library. The TypeScript `stringWidth`
// implementation is asserted against those numbers.
//
//	go run gen-width-corpus.go <path-to-widths.json>
package main

import (
	"encoding/json"
	"fmt"
	"os"

	"github.com/rivo/uniseg"
)

type row struct {
	S string `json:"s"`
	W int    `json:"w"`
}

func main() {
	if len(os.Args) != 2 {
		fmt.Fprintln(os.Stderr, "usage: gen-width-corpus <widths.json>")
		os.Exit(1)
	}

	samples := []string{
		"", "a", "abc", "hello world",
		// CJK and full-width
		"名稱", "日本語", "한국어", "中文",
		"ｆｕｌｌ", "half width",
		// Combining characters (decomposed vs precomposed)
		"é", "é", "à́̂", "ñ", "ñ",
		// Emoji, skin tones, ZWJ sequences and flags
		"\U0001F60A", "\U0001F60A\U0001F60A", "\U0001F44D\U0001F3FD",
		"\U0001F468‍\U0001F469‍\U0001F467‍\U0001F466",
		"\U0001F1E9\U0001F1EA", "\U0001F1E9\U0001F1EA\U0001F1EB\U0001F1F7",
		// Variation selectors
		"❤", "❤️", "☺", "☺️", "⌚",
		"▪", "▪️", "\U0001F60A︎", "⌛︎",
		// East Asian "ambiguous" characters
		"→", "±", "α", "①", "Ω",
		// Latin with diacritics
		"Müller", "Max Müller", "Ünïcödé",
		// Whitespace and control
		"tab\there", "new\nline", "​", "‍", "️", " ", "",
		// Hangul jamo and syllables
		"ᄀᄁᄂ", "각",
		// Assorted wide / astral characters
		"ﷺ", "\U0001D11E", "\U0002000B", "\U0001F004",
		// Mixed content
		"混合 mixed 文字 text",
		"a\U0001F60Ab名c", "|abc|", "​zero​width​",
	}

	rows := make([]row, 0, len(samples))
	for _, s := range samples {
		rows = append(rows, row{S: s, W: uniseg.StringWidth(s)})
	}

	// Also sweep the code point space at a coarse stride, which would catch
	// an error anywhere in the generated range tables.
	for cp := 0x20; cp <= 0x2FFFF; cp += 37 {
		if cp >= 0xD800 && cp <= 0xDFFF {
			continue
		}
		s := string(rune(cp))
		rows = append(rows, row{S: s, W: uniseg.StringWidth(s)})
	}

	out, err := json.MarshalIndent(rows, "", " ")
	if err != nil {
		panic(err)
	}
	if err := os.WriteFile(os.Args[1], append(out, '\n'), 0o644); err != nil {
		panic(err)
	}

	fmt.Fprintf(os.Stderr, "wrote %d width samples\n", len(rows))
}
