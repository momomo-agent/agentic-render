# ⚡ agentic-render

Streaming markdown renderer for AI. Zero deps. One script tag. Beautiful defaults.

Built for [agentic-lite](https://github.com/momomo-agent/agentic-lite) — works with anything.

## Why

- **Streamdown** needs Tailwind + shadcn + React + plugins
- **react-markdown** doesn't handle streaming (half-open code blocks flicker)
- **marked** is a parser, not a renderer — you still need to style everything

agentic-render is none of that. One file. Paste it in. Done.

## Install

```bash
npm install agentic-render
```

Or just drop the script tag:

```html
<script src="https://unpkg.com/agentic-render/render.js"></script>
```

## Quick Start

```html
<div id="output"></div>
<script src="https://unpkg.com/agentic-render/render.js"></script>
<script>
  const r = AgenticRender.create('#output', { theme: 'dark' })

  // Stream tokens one by one — no flicker
  r.append('# Hello\n\n')
  r.append('Some **bold** text\n\n')
  r.append('```js\n')
  r.append('console.log("hi")')  // partial code block — renders fine
  r.append('\n```')              // closes cleanly
</script>
```

## API

### `AgenticRender.create(target, options?)`

Creates a renderer instance attached to a DOM element.

```js
const r = AgenticRender.create('#container', {
  theme: 'dark',          // 'dark' | 'light'
  className: 'my-class',  // extra CSS class on root
  vars: {                 // override any CSS variable
    '--ar-accent': '#ff6b6b',
    '--ar-link': '#818cf8',
  }
})
```

**Returns** an instance with:

| Method | Description |
|--------|-------------|
| `r.append(text)` | Append streaming text (batched via rAF) |
| `r.set(text)` | Replace all content |
| `r.getContent()` | Get current raw markdown |
| `r.setTheme('light')` | Switch theme at runtime |
| `r.setVars({...})` | Override CSS variables |
| `r.element` | The root DOM element |
| `r.destroy()` | Cleanup |

### `AgenticRender.render(markdown)`

One-shot render — returns an HTML string. No DOM needed.

```js
const html = AgenticRender.render('**Hello** world')
// → '<p class="ar-p"><strong class="ar-strong">Hello</strong> world</p>'
```

### `AgenticRender.getCSS(theme?)`

Get the full CSS string for embedding in your own stylesheet.

## Streaming

The whole point. Half-open markdown blocks don't break:

```js
r.append('```python\ndef hello')  // code block stays open, renders with streaming dot
r.append('():\n  print("hi")')
r.append('\n```')                 // closes properly
```

Unterminated code blocks show a pulsing dot indicator. No flicker, no reflow, no broken HTML.

## Customization

Every element uses `ar-*` CSS classes. Override anything:

```css
/* Change heading style */
.ar-h1 { font-size: 2em; color: hotpink; }

/* Custom code block */
.ar-pre { background: #1e1e2e; }
.ar-code { font-family: 'Fira Code', monospace; }

/* Custom link color */
.ar-a { color: #818cf8; }
```

### CSS Variables

All colors are CSS custom properties. Override at runtime or in CSS:

```css
.ar-root {
  --ar-text: #f0f0f0;
  --ar-accent: #ff6b6b;
  --ar-link: #818cf8;
  --ar-code-bg: #1e1e2e;
  --ar-syn-kw: #ff79c6;
  --ar-syn-str: #50fa7b;
  --ar-syn-fn: #8be9fd;
}
```

## What it renders

- Headings (h1–h6)
- Bold, italic, bold-italic, strikethrough
- Inline code + fenced code blocks with syntax highlighting
- Ordered + unordered lists
- Task lists (checkboxes)
- Blockquotes
- Tables (GFM)
- Links + images
- Horizontal rules

## What it doesn't

- LaTeX / math equations
- Mermaid diagrams
- React components
- Require a build step

## Size

~18KB raw, ~6KB gzip. Zero dependencies.

## License

MIT
