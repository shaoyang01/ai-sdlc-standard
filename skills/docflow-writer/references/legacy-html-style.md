# Legacy HTML Style

## Purpose

Preserve the useful visual constraints from the legacy `html-doc-style` skill while moving output routing to DocFlow.

## Default HTML Rules

When generating HTML:

- Write a complete `.html` file.
- Use pure HTML and CSS.
- Inline CSS in a `<style>` tag.
- Do not import external JavaScript, CSS frameworks, Google Fonts, Bootstrap, or Tailwind.
- Use system fonts.

## Legacy Tag Constraint

The legacy `html-doc-style` skill forbids semantic HTML body tags and uses only `div`, `span`, and `br` for document body layout.

Follow that constraint for compatibility unless the user explicitly requests semantic HTML.

Avoid these body tags under the legacy style:

- `h1` to `h6`
- `p`
- `ul`, `ol`, `li`
- `table`, `thead`, `tbody`, `tr`, `th`, `td`
- `code`, `pre`
- `a`, `img`, `hr`, `blockquote`, `em`, `strong`

Use classed `div` and `span` equivalents instead.

## Default Dark Palette

Use:

- Background: `#0a0d0f`
- Panel: `#11161a`
- Card: `#161c22`
- Border: `#1e262f`
- Main text: `#e4e8ec`
- Secondary text: `#8899aa`
- Amber: `#e8a820`
- Blue: `#3b82f6`
- Green: `#22c55e`
- Red: `#f43f5e`
- Purple: `#a78bfa`

## Semantic Integrity

Do not remove ESS-required sections for visual reasons.

Do not merge behavior constraints, exception handling, test feedback, or Gate conclusions into vague prose.

HTML rendering is a presentation layer, not a content schema.

