// agentic-render unit tests — mock DOM for Node.js
import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

// ── Mock DOM ──
// render.js needs document.createElement, document.head, document.querySelector, etc.
// We create a minimal mock.

class MockElement {
  constructor(tag) {
    this.tagName = tag.toUpperCase()
    this.className = ''
    this.id = ''
    this.textContent = ''
    this.innerHTML = ''
    this.children = []
    this.style = new Proxy({}, {
      set(target, prop, value) { target[prop] = value; return true },
      get(target, prop) {
        if (prop === 'setProperty') return (k, v) => { target[k] = v }
        return target[prop]
      },
    })
    this.parentElement = null
  }
  appendChild(child) {
    child.parentElement = this
    this.children.push(child)
    return child
  }
  remove() {
    if (this.parentElement) {
      const idx = this.parentElement.children.indexOf(this)
      if (idx >= 0) this.parentElement.children.splice(idx, 1)
    }
  }
  querySelector(sel) {
    // Simple: just return a new element (enough for create())
    return new MockElement('div')
  }
}

const mockHead = new MockElement('head')
const mockBody = new MockElement('body')

globalThis.document = {
  createElement(tag) { return new MockElement(tag) },
  head: mockHead,
  querySelector(sel) {
    if (sel === 'head') return mockHead
    // Return a container element for create()
    return new MockElement('div')
  },
}

globalThis.requestAnimationFrame = (fn) => { fn(); return 1 }
globalThis.cancelAnimationFrame = () => {}

const require = createRequire(import.meta.url)
const AgenticRender = require('../render.js')

describe('agentic-render', () => {
  it('1. AgenticRender exports exist', () => {
    assert.ok(AgenticRender, 'AgenticRender should be exported')
    assert.equal(typeof AgenticRender.create, 'function', 'should have create')
    assert.equal(typeof AgenticRender.render, 'function', 'should have render')
    assert.equal(typeof AgenticRender.getCSS, 'function', 'should have getCSS')
  })

  it('2. createHighlighter — highlights code snippets', () => {
    // highlightCode is internal, but render() uses it for code blocks.
    // We test via render() with a code block.
    const html = AgenticRender.render('```js\nconst x = 42\n```')
    assert.ok(html.includes('ar-code'), 'should have code class')
    assert.ok(html.includes('ar-kw') || html.includes('ar-num'), 'should have syntax highlighting classes')
  })

  it('3. createRenderer — creates a renderer instance', () => {
    const container = new MockElement('div')
    const renderer = AgenticRender.create(container)
    assert.ok(renderer, 'should return a renderer')
    assert.equal(typeof renderer.append, 'function')
    assert.equal(typeof renderer.set, 'function')
    assert.equal(typeof renderer.getContent, 'function')
    assert.equal(typeof renderer.destroy, 'function')
  })

  it('4. render markdown → HTML conversion', () => {
    const html = AgenticRender.render('Hello world')
    assert.ok(html.includes('Hello world'))
    assert.ok(html.includes('<p'), 'should wrap in paragraph')
  })

  it('5. inline code `...` handling', () => {
    const html = AgenticRender.render('Use `console.log` here')
    assert.ok(html.includes('<code class="ar-inline-code">'), 'should have inline code')
    assert.ok(html.includes('console.log'), 'should contain the code text')
  })

  it('6. bold **...** handling', () => {
    const html = AgenticRender.render('This is **bold** text')
    assert.ok(html.includes('<strong'), 'should have strong tag')
    assert.ok(html.includes('bold'), 'should contain bold text')
  })

  it('7. italic *...* handling', () => {
    const html = AgenticRender.render('This is *italic* text')
    assert.ok(html.includes('<em'), 'should have em tag')
    assert.ok(html.includes('italic'), 'should contain italic text')
  })

  it('8. code block ```...``` handling', () => {
    const md = '```python\nprint("hello")\n```'
    const html = AgenticRender.render(md)
    assert.ok(html.includes('ar-code-wrap'), 'should have code wrap')
    assert.ok(html.includes('ar-pre'), 'should have pre tag')
    assert.ok(html.includes('print'), 'should contain the code')
    assert.ok(html.includes('python'), 'should show language label')
  })

  it('9. list handling (- and *)', () => {
    const mdDash = '- item one\n- item two'
    const htmlDash = AgenticRender.render(mdDash)
    assert.ok(htmlDash.includes('<ul'), 'should create ul for dash lists')
    assert.ok(htmlDash.includes('<li'), 'should create li items')
    assert.ok(htmlDash.includes('item one'))
    assert.ok(htmlDash.includes('item two'))

    const mdStar = '* alpha\n* beta'
    const htmlStar = AgenticRender.render(mdStar)
    assert.ok(htmlStar.includes('<ul'), 'should create ul for star lists')
    assert.ok(htmlStar.includes('alpha'))
    assert.ok(htmlStar.includes('beta'))
  })

  it('10. heading # ## ### handling', () => {
    const h1 = AgenticRender.render('# Heading One')
    assert.ok(h1.includes('<h1'), 'should create h1')
    assert.ok(h1.includes('Heading One'))

    const h2 = AgenticRender.render('## Heading Two')
    assert.ok(h2.includes('<h2'), 'should create h2')
    assert.ok(h2.includes('Heading Two'))

    const h3 = AgenticRender.render('### Heading Three')
    assert.ok(h3.includes('<h3'), 'should create h3')
    assert.ok(h3.includes('Heading Three'))
  })
})
