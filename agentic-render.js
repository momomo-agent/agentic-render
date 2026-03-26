/**
 * agentic-render — Streaming Markdown renderer for AI
 * Zero dependencies. One script tag. Beautiful defaults.
 * 
 * Usage:
 *   const r = AgenticRender.create('#container', { theme: 'dark' })
 *   r.append('Hello **world**')      // stream tokens
 *   r.append('```js\nconsole.log')   // partial code block — no flicker
 *   r.append('("hi")\n```')          // closes gracefully
 *   r.set('# Full replace')          // replace all content
 *   r.destroy()                      // cleanup
 */
;(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory()
  else if (typeof define === 'function' && define.amd) define(factory)
  else root.AgenticRender = factory()
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict'

  // ── Syntax highlight (minimal, covers 90% of AI output) ──────────

  const KEYWORDS = new Set([
    'async','await','break','case','catch','class','const','continue','debugger',
    'default','delete','do','else','export','extends','finally','for','from',
    'function','if','import','in','instanceof','let','new','of','return','static',
    'super','switch','this','throw','try','typeof','var','void','while','with','yield',
    // Python
    'def','elif','except','lambda','pass','raise','with','as','assert','global',
    'nonlocal','and','or','not','is','True','False','None',
    // Rust / Go
    'fn','pub','mod','use','impl','struct','enum','trait','mut','match','loop',
    'move','ref','self','Self','type','where','go','func','package','defer',
    'chan','select','interface','map','range','fallthrough',
  ])

  function highlightCode(code, lang) {
    // Token-based highlighter — avoids regex overlap issues
    const tokens = tokenize(code)
    return tokens.map(t => {
      const text = escHtml(t.value)
      if (t.type === 'string') return `<span class="ar-str">${text}</span>`
      if (t.type === 'comment') return `<span class="ar-cmt">${text}</span>`
      if (t.type === 'number') return `<span class="ar-num">${text}</span>`
      if (t.type === 'keyword') return `<span class="ar-kw">${text}</span>`
      if (t.type === 'function') return `<span class="ar-fn">${text}</span>`
      return text
    }).join('')
  }

  function tokenize(code) {
    const tokens = []
    let i = 0
    while (i < code.length) {
      // Block comments
      if (code[i] === '/' && code[i + 1] === '*') {
        const end = code.indexOf('*/', i + 2)
        const stop = end === -1 ? code.length : end + 2
        tokens.push({ type: 'comment', value: code.slice(i, stop) })
        i = stop
        continue
      }
      // Line comments //
      if (code[i] === '/' && code[i + 1] === '/') {
        const end = code.indexOf('\n', i)
        const stop = end === -1 ? code.length : end
        tokens.push({ type: 'comment', value: code.slice(i, stop) })
        i = stop
        continue
      }
      // Line comments # (Python-style, not inside a word)
      if (code[i] === '#' && (i === 0 || /[\s;({[]/.test(code[i - 1]))) {
        const end = code.indexOf('\n', i)
        const stop = end === -1 ? code.length : end
        tokens.push({ type: 'comment', value: code.slice(i, stop) })
        i = stop
        continue
      }
      // Strings
      if (code[i] === '"' || code[i] === "'" || code[i] === '`') {
        const quote = code[i]
        let j = i + 1
        while (j < code.length) {
          if (code[j] === '\\') { j += 2; continue }
          if (code[j] === quote) { j++; break }
          if (quote !== '`' && code[j] === '\n') break
          j++
        }
        tokens.push({ type: 'string', value: code.slice(i, j) })
        i = j
        continue
      }
      // Numbers
      if (/\d/.test(code[i]) && (i === 0 || !/\w/.test(code[i - 1]))) {
        let j = i
        while (j < code.length && /[\d.eExXa-fA-F_]/.test(code[j])) j++
        tokens.push({ type: 'number', value: code.slice(i, j) })
        i = j
        continue
      }
      // Words (identifiers / keywords)
      if (/[a-zA-Z_$]/.test(code[i])) {
        let j = i
        while (j < code.length && /[\w$]/.test(code[j])) j++
        const word = code.slice(i, j)
        // Look ahead for function call
        let k = j
        while (k < code.length && code[k] === ' ') k++
        if (KEYWORDS.has(word)) {
          tokens.push({ type: 'keyword', value: word })
        } else if (code[k] === '(') {
          tokens.push({ type: 'function', value: word })
        } else {
          tokens.push({ type: 'plain', value: word })
        }
        i = j
        continue
      }
      // Everything else
      tokens.push({ type: 'plain', value: code[i] })
      i++
    }
    return tokens
  }

  // ── HTML escape ──────────────────────────────────────────────────

  function escHtml(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  }

  // ── Markdown parser (streaming-safe) ─────────────────────────────

  function parseMarkdown(src) {
    // Normalize line endings
    src = src.replace(/\r\n?/g, '\n')

    let html = ''
    const lines = src.split('\n')
    let i = 0
    let inCodeBlock = false
    let codeLang = ''
    let codeContent = ''
    let inList = false
    let listType = ''
    let inBlockquote = false
    let blockquoteContent = ''
    let inTable = false
    let tableRows = []

    function flushBlockquote() {
      if (inBlockquote) {
        html += `<blockquote class="ar-bq">${inlineMarkdown(blockquoteContent.trim())}</blockquote>`
        blockquoteContent = ''
        inBlockquote = false
      }
    }

    function flushList() {
      if (inList) {
        html += `</${listType}>`
        inList = false
      }
    }

    function flushTable() {
      if (inTable && tableRows.length > 0) {
        let t = '<table class="ar-table"><thead><tr>'
        const headers = tableRows[0]
        for (const h of headers) t += `<th>${inlineMarkdown(h.trim())}</th>`
        t += '</tr></thead><tbody>'
        for (let r = 2; r < tableRows.length; r++) {
          t += '<tr>'
          for (let c = 0; c < tableRows[r].length; c++) {
            t += `<td>${inlineMarkdown((tableRows[r][c] || '').trim())}</td>`
          }
          t += '</tr>'
        }
        t += '</tbody></table>'
        html += t
        tableRows = []
        inTable = false
      }
    }

    while (i < lines.length) {
      const line = lines[i]

      // Code blocks
      if (/^```/.test(line)) {
        if (!inCodeBlock) {
          flushBlockquote(); flushList(); flushTable()
          inCodeBlock = true
          codeLang = line.slice(3).trim()
          codeContent = ''
          i++
          continue
        } else {
          // Close code block
          html += `<div class="ar-code-wrap"><div class="ar-code-header">${escHtml(codeLang || 'code')}<button class="ar-copy" onclick="navigator.clipboard.writeText(this.parentElement.nextElementSibling.textContent).then(()=>{this.textContent='Copied!';setTimeout(()=>this.textContent='Copy',1500)})">Copy</button></div><pre class="ar-pre"><code class="ar-code">${highlightCode(codeContent, codeLang)}</code></pre></div>`
          inCodeBlock = false
          codeLang = ''
          codeContent = ''
          i++
          continue
        }
      }

      if (inCodeBlock) {
        codeContent += (codeContent ? '\n' : '') + line
        i++
        continue
      }

      // Table detection
      if (/^\|(.+)\|$/.test(line)) {
        const cells = line.slice(1, -1).split('|')
        if (!inTable) {
          flushBlockquote(); flushList()
          inTable = true
          tableRows = [cells]
        } else {
          // Skip separator row
          if (/^[\s|:-]+$/.test(line)) {
            tableRows.push(null) // placeholder for separator
          } else {
            tableRows.push(cells)
          }
        }
        i++
        continue
      } else if (inTable) {
        flushTable()
      }

      // Blockquote
      if (/^>\s?/.test(line)) {
        flushList(); flushTable()
        inBlockquote = true
        blockquoteContent += line.replace(/^>\s?/, '') + '\n'
        i++
        continue
      } else if (inBlockquote) {
        flushBlockquote()
      }

      // Headings
      const headingMatch = line.match(/^(#{1,6})\s+(.+)$/)
      if (headingMatch) {
        flushList(); flushTable(); flushBlockquote()
        const level = headingMatch[1].length
        html += `<h${level} class="ar-h ar-h${level}">${inlineMarkdown(headingMatch[2])}</h${level}>`
        i++
        continue
      }

      // Horizontal rule
      if (/^(-{3,}|_{3,}|\*{3,})\s*$/.test(line)) {
        flushList(); flushTable(); flushBlockquote()
        html += '<hr class="ar-hr">'
        i++
        continue
      }

      // Unordered list
      const ulMatch = line.match(/^(\s*)[-*+]\s+(.+)$/)
      if (ulMatch) {
        flushTable(); flushBlockquote()
        if (!inList || listType !== 'ul') {
          flushList()
          html += '<ul class="ar-ul">'
          inList = true
          listType = 'ul'
        }
        // Check for task list
        const taskMatch = ulMatch[2].match(/^\[([ xX])\]\s*(.*)$/)
        if (taskMatch) {
          const checked = taskMatch[1] !== ' '
          html += `<li class="ar-li ar-task"><span class="ar-checkbox ${checked ? 'ar-checked' : ''}">${checked ? '✓' : ''}</span>${inlineMarkdown(taskMatch[2])}</li>`
        } else {
          html += `<li class="ar-li">${inlineMarkdown(ulMatch[2])}</li>`
        }
        i++
        continue
      }

      // Ordered list
      const olMatch = line.match(/^(\s*)\d+[.)]\s+(.+)$/)
      if (olMatch) {
        flushTable(); flushBlockquote()
        if (!inList || listType !== 'ol') {
          flushList()
          html += '<ol class="ar-ol">'
          inList = true
          listType = 'ol'
        }
        html += `<li class="ar-li">${inlineMarkdown(olMatch[2])}</li>`
        i++
        continue
      }

      if (inList && line.trim() === '') {
        flushList()
        i++
        continue
      }

      // Empty line
      if (line.trim() === '') {
        flushList()
        i++
        continue
      }

      // Paragraph
      flushList(); flushTable(); flushBlockquote()
      html += `<p class="ar-p">${inlineMarkdown(line)}</p>`
      i++
    }

    // Handle unterminated code block (streaming!)
    if (inCodeBlock) {
      html += `<div class="ar-code-wrap"><div class="ar-code-header">${escHtml(codeLang || 'code')}<span class="ar-streaming-dot"></span></div><pre class="ar-pre"><code class="ar-code">${highlightCode(codeContent, codeLang)}</code></pre></div>`
    }

    flushBlockquote()
    flushList()
    flushTable()

    return html
  }

  // ── Inline markdown ──────────────────────────────────────────────

  function inlineMarkdown(text) {
    let s = escHtml(text)

    // Images
    s = s.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img class="ar-img" src="$2" alt="$1" loading="lazy">')
    // Links
    s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a class="ar-a" href="$2" target="_blank" rel="noopener">$1</a>')
    // Bold + italic
    s = s.replace(/\*\*\*(.+?)\*\*\*/g, '<strong class="ar-strong"><em>$1</em></strong>')
    // Bold
    s = s.replace(/\*\*(.+?)\*\*/g, '<strong class="ar-strong">$1</strong>')
    s = s.replace(/__(.+?)__/g, '<strong class="ar-strong">$1</strong>')
    // Italic
    s = s.replace(/\*(.+?)\*/g, '<em class="ar-em">$1</em>')
    s = s.replace(/_(.+?)_/g, '<em class="ar-em">$1</em>')
    // Strikethrough
    s = s.replace(/~~(.+?)~~/g, '<del class="ar-del">$1</del>')
    // Inline code
    s = s.replace(/`([^`]+?)`/g, '<code class="ar-inline-code">$1</code>')

    return s
  }

  // ── Default styles ───────────────────────────────────────────────

  const THEME_DARK = {
    '--ar-bg': 'transparent',
    '--ar-text': '#e4e4e7',
    '--ar-text-2': '#a1a1aa',
    '--ar-text-3': '#71717a',
    '--ar-accent': '#f5c518',
    '--ar-link': '#60a5fa',
    '--ar-border': '#27272a',
    '--ar-code-bg': '#18181b',
    '--ar-code-header-bg': '#1f1f23',
    '--ar-inline-code-bg': '#27272a',
    '--ar-bq-border': '#3f3f46',
    '--ar-bq-bg': '#18181b',
    '--ar-hr': '#27272a',
    '--ar-table-header-bg': '#1f1f23',
    '--ar-table-border': '#27272a',
    '--ar-table-stripe': '#18181b08',
    // Syntax
    '--ar-syn-kw': '#c792ea',
    '--ar-syn-str': '#c3e88d',
    '--ar-syn-num': '#f78c6c',
    '--ar-syn-cmt': '#546e7a',
    '--ar-syn-fn': '#82aaff',
  }

  const THEME_LIGHT = {
    '--ar-bg': 'transparent',
    '--ar-text': '#18181b',
    '--ar-text-2': '#52525b',
    '--ar-text-3': '#a1a1aa',
    '--ar-accent': '#d97706',
    '--ar-link': '#2563eb',
    '--ar-border': '#e4e4e7',
    '--ar-code-bg': '#f4f4f5',
    '--ar-code-header-bg': '#e4e4e7',
    '--ar-inline-code-bg': '#f4f4f5',
    '--ar-bq-border': '#d4d4d8',
    '--ar-bq-bg': '#fafafa',
    '--ar-hr': '#e4e4e7',
    '--ar-table-header-bg': '#f4f4f5',
    '--ar-table-border': '#e4e4e7',
    '--ar-table-stripe': '#fafafa',
    // Syntax
    '--ar-syn-kw': '#8b5cf6',
    '--ar-syn-str': '#16a34a',
    '--ar-syn-num': '#ea580c',
    '--ar-syn-cmt': '#a1a1aa',
    '--ar-syn-fn': '#2563eb',
  }

  const BASE_CSS = `
.ar-root {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
  font-size: 15px;
  line-height: 1.75;
  color: var(--ar-text);
  background: var(--ar-bg);
  word-wrap: break-word;
  overflow-wrap: break-word;
}

/* ── Typography ── */
.ar-h { font-weight: 600; letter-spacing: -0.02em; margin: 1.5em 0 0.6em; }
.ar-h:first-child { margin-top: 0; }
.ar-h1 { font-size: 1.65em; line-height: 1.2; }
.ar-h2 { font-size: 1.35em; line-height: 1.25; }
.ar-h3 { font-size: 1.15em; line-height: 1.3; }
.ar-h4, .ar-h5, .ar-h6 { font-size: 1em; }
.ar-p { margin: 0.75em 0; }
.ar-p:first-child { margin-top: 0; }
.ar-strong { font-weight: 600; color: var(--ar-text); }
.ar-em { font-style: italic; }
.ar-del { text-decoration: line-through; color: var(--ar-text-3); }
.ar-a { color: var(--ar-link); text-decoration: none; border-bottom: 1px solid transparent; transition: border-color 0.15s; }
.ar-a:hover { border-bottom-color: var(--ar-link); }

/* ── Code ── */
.ar-code-wrap {
  margin: 1em 0;
  border: 1px solid var(--ar-border);
  border-radius: 8px;
  overflow: hidden;
}
.ar-code-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 14px;
  background: var(--ar-code-header-bg);
  font-size: 12px;
  color: var(--ar-text-3);
  font-family: inherit;
}
.ar-copy {
  background: none; border: none; color: var(--ar-text-3); cursor: pointer;
  font-size: 12px; padding: 2px 8px; border-radius: 4px; font-family: inherit;
  transition: color 0.15s;
}
.ar-copy:hover { color: var(--ar-text-2); }
.ar-pre {
  margin: 0;
  padding: 16px 18px;
  background: var(--ar-code-bg);
  overflow-x: auto;
  font-size: 13.5px;
  line-height: 1.6;
}
.ar-code {
  font-family: 'JetBrains Mono', 'SF Mono', 'Fira Code', 'Cascadia Code', 'Consolas', monospace;
  background: none;
  padding: 0;
}
.ar-inline-code {
  font-family: 'JetBrains Mono', 'SF Mono', 'Fira Code', 'Cascadia Code', 'Consolas', monospace;
  background: var(--ar-inline-code-bg);
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 0.875em;
}

/* ── Syntax colors ── */
.ar-kw { color: var(--ar-syn-kw); }
.ar-str { color: var(--ar-syn-str); }
.ar-num { color: var(--ar-syn-num); }
.ar-cmt { color: var(--ar-syn-cmt); font-style: italic; }
.ar-fn { color: var(--ar-syn-fn); }

/* ── Lists ── */
.ar-ul, .ar-ol { padding-left: 1.5em; margin: 0.75em 0; }
.ar-li { margin: 0.3em 0; }
.ar-li::marker { color: var(--ar-text-3); }
.ar-task { list-style: none; margin-left: -1.5em; padding-left: 0; display: flex; align-items: flex-start; gap: 8px; }
.ar-checkbox {
  display: inline-flex; align-items: center; justify-content: center;
  width: 18px; height: 18px; min-width: 18px;
  border: 1.5px solid var(--ar-border); border-radius: 4px;
  font-size: 12px; margin-top: 3px;
}
.ar-checked { background: var(--ar-accent); border-color: var(--ar-accent); color: #000; }

/* ── Blockquote ── */
.ar-bq {
  margin: 0.75em 0;
  padding: 0.5em 1em;
  border-left: 3px solid var(--ar-bq-border);
  background: var(--ar-bq-bg);
  color: var(--ar-text-2);
  border-radius: 0 6px 6px 0;
}

/* ── HR ── */
.ar-hr { border: none; border-top: 1px solid var(--ar-hr); margin: 2em 0; }

/* ── Table ── */
.ar-table {
  width: 100%; border-collapse: collapse; margin: 1em 0;
  font-size: 14px;
}
.ar-table th, .ar-table td {
  padding: 8px 12px; text-align: left;
  border: 1px solid var(--ar-table-border);
}
.ar-table th { background: var(--ar-table-header-bg); font-weight: 600; }
.ar-table tr:nth-child(even) td { background: var(--ar-table-stripe); }

/* ── Image ── */
.ar-img { max-width: 100%; border-radius: 8px; margin: 0.5em 0; }

/* ── Streaming indicator ── */
@keyframes ar-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
.ar-streaming-dot::after {
  content: '●';
  color: var(--ar-accent);
  font-size: 10px;
  animation: ar-pulse 1.2s ease-in-out infinite;
  margin-left: 4px;
}
`

  // ── Style injection ──────────────────────────────────────────────

  let styleInjected = false

  function injectStyles() {
    if (styleInjected) return
    const style = document.createElement('style')
    style.id = 'agentic-render-styles'
    style.textContent = BASE_CSS
    document.head.appendChild(style)
    styleInjected = true
  }

  // ── Public API ───────────────────────────────────────────────────

  function create(target, options = {}) {
    injectStyles()

    const el = typeof target === 'string' ? document.querySelector(target) : target
    if (!el) throw new Error(`agentic-render: target "${target}" not found`)

    const theme = options.theme === 'light' ? THEME_LIGHT : THEME_DARK
    const customVars = options.vars || {}
    const allVars = { ...theme, ...customVars }

    // Create root
    const root = document.createElement('div')
    root.className = `ar-root ${options.className || ''}`
    for (const [k, v] of Object.entries(allVars)) {
      root.style.setProperty(k, v)
    }
    el.appendChild(root)

    let content = ''
    let rafId = null

    function render() {
      root.innerHTML = parseMarkdown(content)
      rafId = null
    }

    function scheduleRender() {
      if (rafId) return
      rafId = requestAnimationFrame(render)
    }

    return {
      /** Append streaming text */
      append(text) {
        content += text
        scheduleRender()
      },

      /** Replace all content */
      set(text) {
        content = text
        scheduleRender()
      },

      /** Get current raw markdown */
      getContent() {
        return content
      },

      /** Update theme vars at runtime */
      setVars(vars) {
        for (const [k, v] of Object.entries(vars)) {
          root.style.setProperty(k, v)
        }
      },

      /** Set theme */
      setTheme(name) {
        const t = name === 'light' ? THEME_LIGHT : THEME_DARK
        for (const [k, v] of Object.entries(t)) {
          root.style.setProperty(k, v)
        }
      },

      /** Get the root DOM element */
      get element() {
        return root
      },

      /** Cleanup */
      destroy() {
        if (rafId) cancelAnimationFrame(rafId)
        root.remove()
      }
    }
  }

  /**
   * One-shot render — returns HTML string
   */
  function render(markdown, options = {}) {
    return parseMarkdown(markdown)
  }

  /**
   * Get CSS for embedding (no <style> injection needed)
   */
  function getCSS(theme = 'dark') {
    const vars = theme === 'light' ? THEME_LIGHT : THEME_DARK
    const varBlock = Object.entries(vars).map(([k, v]) => `  ${k}: ${v};`).join('\n')
    return `.ar-root {\n${varBlock}\n}\n${BASE_CSS}`
  }

  return { create, render, getCSS, THEME_DARK, THEME_LIGHT }
})
