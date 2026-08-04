//go:build ignore

// Generates test/corpus/expected.json by running every case in
// test/corpus/cases.json through the *Go* library. The TypeScript port is
// then asserted against those outputs, which is how the port is verified
// beyond the golden files.
//
// Run from a checkout of the Go library:
//
//	go run gen-corpus-expectations.go <path-to-cases.json> <path-to-expected.json>
package main

import (
	"encoding/json"
	"fmt"
	"os"

	"github.com/JohannesKaufmann/html-to-markdown/v2/converter"
	"github.com/JohannesKaufmann/html-to-markdown/v2/plugin/base"
	"github.com/JohannesKaufmann/html-to-markdown/v2/plugin/commonmark"
	"github.com/JohannesKaufmann/html-to-markdown/v2/plugin/strikethrough"
	"github.com/JohannesKaufmann/html-to-markdown/v2/plugin/table"
)

type testCase struct {
	Config string `json:"config"`
	HTML   string `json:"html"`
}

type result struct {
	Config   string `json:"config"`
	HTML     string `json:"html"`
	Expected string `json:"expected"`
}

func build(config string) (*converter.Converter, []converter.ConvertOptionFunc) {
	var opts []converter.ConvertOptionFunc

	switch config {
	case "default":
		return converter.NewConverter(converter.WithPlugins(
			base.NewBasePlugin(), commonmark.NewCommonmarkPlugin(),
		)), opts

	case "setext":
		return converter.NewConverter(converter.WithPlugins(
			base.NewBasePlugin(),
			commonmark.NewCommonmarkPlugin(commonmark.WithHeadingStyle(commonmark.HeadingStyleSetext)),
		)), opts

	case "underscore":
		return converter.NewConverter(converter.WithPlugins(
			base.NewBasePlugin(),
			commonmark.NewCommonmarkPlugin(
				commonmark.WithEmDelimiter("_"),
				commonmark.WithStrongDelimiter("__"),
			),
		)), opts

	case "plus-bullet":
		return converter.NewConverter(converter.WithPlugins(
			base.NewBasePlugin(),
			commonmark.NewCommonmarkPlugin(commonmark.WithBulletListMarker("+")),
		)), opts

	case "tilde-fence":
		return converter.NewConverter(converter.WithPlugins(
			base.NewBasePlugin(),
			commonmark.NewCommonmarkPlugin(commonmark.WithCodeBlockFence("~~~")),
		)), opts

	case "no-escape":
		return converter.NewConverter(
			converter.WithPlugins(base.NewBasePlugin(), commonmark.NewCommonmarkPlugin()),
			converter.WithEscapeMode(converter.EscapeModeDisabled),
		), opts

	case "domain":
		opts = append(opts, converter.WithDomain("https://example.com"))
		return converter.NewConverter(converter.WithPlugins(
			base.NewBasePlugin(), commonmark.NewCommonmarkPlugin(),
		)), opts

	case "link-skip":
		return converter.NewConverter(converter.WithPlugins(
			base.NewBasePlugin(),
			commonmark.NewCommonmarkPlugin(
				commonmark.WithLinkEmptyHrefBehavior(commonmark.LinkBehaviorSkip),
				commonmark.WithLinkEmptyContentBehavior(commonmark.LinkBehaviorSkip),
			),
		)), opts

	case "no-list-comment":
		return converter.NewConverter(converter.WithPlugins(
			base.NewBasePlugin(),
			commonmark.NewCommonmarkPlugin(commonmark.WithListEndComment(false)),
		)), opts

	case "strike":
		return converter.NewConverter(converter.WithPlugins(
			base.NewBasePlugin(), commonmark.NewCommonmarkPlugin(),
			strikethrough.NewStrikethroughPlugin(),
		)), opts

	// The table plugin's option type is unexported, so each variant has to
	// construct its own plugin instance.
	case "table":
		return withTable(table.NewTablePlugin()), opts
	case "table-minimal":
		return withTable(table.NewTablePlugin(
			table.WithCellPaddingBehavior(table.CellPaddingBehaviorMinimal))), opts
	case "table-none":
		return withTable(table.NewTablePlugin(
			table.WithCellPaddingBehavior(table.CellPaddingBehaviorNone))), opts
	case "table-mirror":
		return withTable(table.NewTablePlugin(
			table.WithSpanCellBehavior(table.SpanBehaviorMirror))), opts
	case "table-preserve":
		return withTable(table.NewTablePlugin(
			table.WithNewlineBehavior(table.NewlineBehaviorPreserve))), opts
	case "table-skip-empty":
		return withTable(table.NewTablePlugin(table.WithSkipEmptyRows(true))), opts
	case "table-promote":
		return withTable(table.NewTablePlugin(table.WithHeaderPromotion(true))), opts
	case "table-presentation":
		return withTable(table.NewTablePlugin(table.WithPresentationTables(true))), opts
	}

	panic("unknown config: " + config)
}

func withTable(tablePlugin converter.Plugin) *converter.Converter {
	return converter.NewConverter(converter.WithPlugins(
		base.NewBasePlugin(),
		commonmark.NewCommonmarkPlugin(),
		tablePlugin,
	))
}

func main() {
	if len(os.Args) != 3 {
		fmt.Fprintln(os.Stderr, "usage: gen-corpus-expectations <cases.json> <expected.json>")
		os.Exit(1)
	}

	raw, err := os.ReadFile(os.Args[1])
	if err != nil {
		panic(err)
	}

	var cases []testCase
	if err := json.Unmarshal(raw, &cases); err != nil {
		panic(err)
	}

	results := make([]result, 0, len(cases))
	for _, tc := range cases {
		conv, opts := build(tc.Config)
		out, err := conv.ConvertString(tc.HTML, opts...)
		if err != nil {
			panic(fmt.Sprintf("case %q (%s): %v", tc.HTML, tc.Config, err))
		}
		results = append(results, result{Config: tc.Config, HTML: tc.HTML, Expected: out})
	}

	encoded, err := json.MarshalIndent(results, "", "  ")
	if err != nil {
		panic(err)
	}
	if err := os.WriteFile(os.Args[2], append(encoded, '\n'), 0o644); err != nil {
		panic(err)
	}

	fmt.Fprintf(os.Stderr, "wrote %d expectations\n", len(results))
}
