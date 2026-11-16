// Import: reads a dropped or chosen file into either a table (rows of cells, the first row its headings) or outline
// text ("# Heading", "- item", indented "- subitem"), for ImportTasksDialog.
//   Sheets: CSV · TSV · and, with SheetJS (loaded only when needed), Excel (.xlsx .xlsm .xls) · Numbers · OpenDocument
//     (.ods). The first sheet is read; dates come in as dates.
//   Documents: Word (.docx) · OpenDocument (.odt) · Rich Text (.rtf, TextEdit) · HTML · TXT · Markdown. Word and
//     OpenDocument are zipped XML, which the browser unzips itself (DecompressionStream).
//     Headings become "# " lines, bullet and numbered lists "- " lines. A table with a Task/Title/Name column
//     in a document is read as a sheet.
//   Not readable in the browser (a message says how to export): Pages, Keynote, old Word (.doc).
export type ImportFile = { kind: 'table'; rows: string[][] } | { kind: 'text'; text: string }

export const IMPORT_ACCEPT = '.csv,.tsv,.xlsx,.xlsm,.xls,.numbers,.ods,.docx,.odt,.rtf,.html,.htm,.txt,.md,.markdown,.pages,.key,.doc'

// Files we can't read, and how to get them into one we can
const EXPORT_HINT: Record<string, string> = {
  pages: 'Pages files can’t be read here. In Pages, choose File → Export To → Word or Plain Text, then import that file.',
  key: 'Keynote files can’t be read here. Copy the slide text into the box below, one task per line.',
  doc: 'Old Word files (.doc) can’t be read here. In Word, choose File → Save As → Word Document (.docx), then import that file.',
}

export async function readImportFile(f: File): Promise<ImportFile> {
  const ext = (f.name.split('.').pop() || '').toLowerCase()
  if (EXPORT_HINT[ext]) throw new Error(EXPORT_HINT[ext])
  if (ext === 'csv' || ext === 'tsv') return { kind: 'table', rows: parseDelimited(await f.text(), ext === 'tsv' ? '\t' : ',') }
  if (ext === 'txt' || ext === 'md' || ext === 'markdown') return { kind: 'text', text: await f.text() }
  if (ext === 'rtf') return { kind: 'text', text: rtfToText(await f.text()) }
  if (ext === 'html' || ext === 'htm') return htmlToImport(await f.text())
  if (['xlsx', 'xlsm', 'xls', 'numbers', 'ods'].includes(ext)) return { kind: 'table', rows: await sheetRows(f) }
  if (ext === 'docx' || ext === 'odt') {
    let zip: Zip
    try {
      zip = await unzip(await f.arrayBuffer())
    } catch {
      throw new Error(`${f.name} couldn’t be opened. Save it again from its app, then import it.`)
    }
    return ext === 'docx' ? docxToImport(zip) : odtToImport(zip)
  }
  throw new Error('This file type can’t be imported. Use a spreadsheet (Excel, CSV) or a document (Word, Rich Text, TXT, Markdown).')
}

// A table "looks like tasks" when a heading names the task (a document's table is only used then)
export const isTaskTable = (rows: string[][]) => !!rows[0]?.some((h) => /task|title|name|content/i.test(h))

// ── CSV / TSV ─────────────────────────────────────────────────────────────────
// Quoted cells may hold the separator, "" for a quote, and line breaks
export function parseDelimited(src: string, sep: string) {
  const rows: string[][] = []
  let row: string[] = []
  let cur = ''
  let q = false
  for (let i = 0; i < src.length; i++) {
    const c = src[i]
    if (q) {
      if (c === '"' && src[i + 1] === '"') (cur += '"'), i++
      else if (c === '"') q = false
      else cur += c
    } else if (c === '"') q = true
    else if (c === sep) row.push(cur.trim()), (cur = '')
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++
      row.push(cur.trim())
      rows.push(row)
      ;(row = []), (cur = '')
    } else cur += c
  }
  if (cur || row.length) row.push(cur.trim()), rows.push(row)
  return tidy(rows)
}

// Drop empty rows and trailing empty cells
function tidy(rows: string[][]) {
  return rows
    .map((r) => {
      let n = r.length
      while (n && !r[n - 1]) n--
      return r.slice(0, n)
    })
    .filter((r) => r.length)
}

// ── Zip (Office and OpenDocument files) ──────────────────────────────────────
type Zip = { names: string[]; text: (name: string) => Promise<string | null> }

async function unzip(buf: ArrayBuffer): Promise<Zip> {
  const v = new DataView(buf)
  const bytes = new Uint8Array(buf)
  // End of central directory: the last 22+ bytes
  let eocd = -1
  for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 65557); i--)
    if (v.getUint32(i, true) === 0x06054b50) {
      eocd = i
      break
    }
  if (eocd < 0) throw new Error('not a zip')
  const count = v.getUint16(eocd + 10, true)
  let p = v.getUint32(eocd + 16, true)
  const utf8 = new TextDecoder()
  const entries = new Map<string, { method: number; size: number; offset: number }>()
  for (let i = 0; i < count; i++) {
    if (v.getUint32(p, true) !== 0x02014b50) throw new Error('bad zip')
    const nameLen = v.getUint16(p + 28, true)
    const name = utf8.decode(bytes.subarray(p + 46, p + 46 + nameLen))
    entries.set(name, { method: v.getUint16(p + 10, true), size: v.getUint32(p + 20, true), offset: v.getUint32(p + 42, true) })
    p += 46 + nameLen + v.getUint16(p + 30, true) + v.getUint16(p + 32, true)
  }
  return {
    names: [...entries.keys()],
    async text(name) {
      const e = entries.get(name.replace(/^\//, ''))
      if (!e) return null
      const start = e.offset + 30 + v.getUint16(e.offset + 26, true) + v.getUint16(e.offset + 28, true)
      const data = bytes.slice(start, start + e.size)
      if (e.method === 0) return utf8.decode(data)
      const out = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
      return utf8.decode(await new Response(out).arrayBuffer())
    },
  }
}

// A line typed as a list item ("•<tab>Item", "1.<tab>Item", "2)<tab>Item", "1<tab>Item") → "- Item" at that level
const TYPED_BULLET = /^\s*(?:[•◦▪‣⁃–]|\d+[.)]?)\t\s*/
const asListItem = (text: string, level: number) => (TYPED_BULLET.test(text) ? `${'  '.repeat(level)}- ${text.replace(TYPED_BULLET, '')}` : null)

// A document without heading styles (typed, or converted by TextEdit): a short line that is all bold and bigger
// than the body text (the size most of the text has) is a heading
const bodySizeOf = (sizes: Map<number, number>) => [...sizes].sort((a, b) => b[1] - a[1])[0]?.[0] || 0
const isBigBold = (text: string, bold: boolean, size: number, bodySize: number) => bold && size > bodySize && text.length < 120

const xml = (s: string) => new DOMParser().parseFromString(s, 'application/xml')
const all = (n: Document | Element, tag: string) => Array.from(n.getElementsByTagNameNS('*', tag))
const kids = (n: Element, tag?: string) => Array.from(n.children).filter((c) => !tag || c.localName === tag)

// ── Spreadsheets: Excel, Numbers, OpenDocument (SheetJS) ──────────────────────
// The first sheet, as text cells; date cells → YYYY-MM-DD (the date as shown, whatever the time zone)
const isoDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
async function sheetRows(f: File) {
  const XLSX = await import('xlsx')
  let wb
  try {
    wb = XLSX.read(await f.arrayBuffer(), { cellDates: true, dense: true })
  } catch {
    throw new Error(`${f.name} couldn’t be opened. Save it again from its app, or export it as CSV.`)
  }
  const ws = wb.Sheets[wb.SheetNames[0]]
  if (!ws) return []
  const rows = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, raw: true, defval: '', blankrows: false })
  return tidy(rows.map((r) => r.map((v) => (v instanceof Date ? isoDay(v) : String(v ?? '').trim()))))
}

// ── Word (.docx) ──────────────────────────────────────────────────────────────
// Headings (Title, Heading 1–9) → "# ", list paragraphs → "- " indented by their level, other paragraphs as they are
async function docxToImport(zip: Zip): Promise<ImportFile> {
  const doc = xml((await zip.text('word/document.xml')) || '')
  const body = all(doc, 'body')[0]
  if (!body) return { kind: 'text', text: '' }
  const paraText = (p: Element) =>
    all(p, '*')
      .map((n) => (n.localName === 't' ? n.textContent : n.localName === 'tab' && n.parentElement?.localName === 'r' ? '\t' : n.localName === 'br' ? ' ' : ''))
      .join('')
      .trim()
  const tables = all(body, 'tbl').map((tbl) => tidy(kids(tbl, 'tr').map((tr) => kids(tr, 'tc').map((tc) => kids(tc, 'p').map(paraText).join(' ').trim()))))
  const taskTable = tables.find(isTaskTable)
  if (taskTable) return { kind: 'table', rows: taskTable }

  const runs = (p: Element) =>
    kids(p, 'r')
      .map((r) => {
        const rPr = kids(r, 'rPr')[0]
        const b = rPr && kids(rPr, 'b')[0]
        return {
          text: kids(r, 't').map((t) => t.textContent).join(''),
          bold: !!b && !/^(0|false)$/.test(b.getAttribute('w:val') || ''),
          size: Number((rPr && kids(rPr, 'sz')[0]?.getAttribute('w:val')) || 0),
        }
      })
      .filter((r) => r.text.trim())
  const sizes = new Map<number, number>()
  kids(body, 'p').forEach((p) => runs(p).forEach((r) => sizes.set(r.size, (sizes.get(r.size) || 0) + r.text.length)))
  const bodySize = bodySizeOf(sizes)
  const looksLikeHeading = (p: Element, text: string) => {
    const rs = runs(p)
    return rs.length > 0 && isBigBold(text, rs.every((r) => r.bold), Math.max(...rs.map((r) => r.size)), bodySize)
  }

  const lines: string[] = []
  kids(body, 'p').forEach((p) => {
    const text = paraText(p)
    if (!text) return
    const pPr = kids(p, 'pPr')[0]
    const style = (pPr && kids(pPr, 'pStyle')[0]?.getAttribute('w:val')) || ''
    const num = pPr && kids(pPr, 'numPr')[0]
    // Indent level for typed bullets: every 720 twips (half an inch) past the first
    const left = Number((pPr && kids(pPr, 'ind')[0]?.getAttribute('w:left')) || 0)
    const typed = asListItem(text, Math.max(0, Math.round(left / 720) - 1))
    if (/^(title|heading\s?\d)$/i.test(style)) lines.push(`# ${text}`)
    else if (num || /^list/i.test(style)) lines.push(`${'  '.repeat(Number(kids(num || pPr!, 'ilvl')[0]?.getAttribute('w:val') || 0))}- ${text}`)
    else if (typed) lines.push(typed)
    else if (looksLikeHeading(p, text)) lines.push(`# ${text}`)
    else lines.push(text)
  })
  return { kind: 'text', text: lines.join('\n') }
}

// ── OpenDocument text (.odt) ──────────────────────────────────────────────────
async function odtToImport(zip: Zip): Promise<ImportFile> {
  const doc = xml((await zip.text('content.xml')) || '')
  const body = all(doc, 'text')[0]
  if (!body) return { kind: 'text', text: '' }
  const tables = all(body, 'table').map((t) => tidy(all(t, 'table-row').map((r) => kids(r, 'table-cell').map((c) => all(c, 'p').map((p) => p.textContent).join(' ').trim()))))
  const taskTable = tables.find(isTaskTable)
  if (taskTable) return { kind: 'table', rows: taskTable }

  // Styles: bold and size per style name (a paragraph's own, or the spans inside it)
  const styles = new Map<string, { bold: boolean; size: number }>()
  all(doc, 'style').forEach((st) => {
    const tp = kids(st, 'text-properties')[0]
    styles.set(st.getAttribute('style:name') || '', { bold: tp?.getAttribute('fo:font-weight') === 'bold', size: parseFloat(tp?.getAttribute('fo:font-size') || '0') })
  })
  const look = (p: Element) => {
    const own = styles.get(p.getAttribute('text:style-name') || '')
    const spans = kids(p, 'span').filter((x) => x.textContent?.trim())
    const bare = Array.from(p.childNodes).some((n) => n.nodeType === 3 && n.textContent?.trim())
    const bold = !!own?.bold || (!bare && spans.length > 0 && spans.every((x) => styles.get(x.getAttribute('text:style-name') || '')?.bold))
    return { bold, size: Math.max(own?.size || 0, ...spans.map((x) => styles.get(x.getAttribute('text:style-name') || '')?.size || 0)) }
  }
  const sizes = new Map<number, number>()
  all(body, 'p').forEach((p) => {
    const n = p.textContent?.length || 0
    sizes.set(look(p).size, (sizes.get(look(p).size) || 0) + n)
  })
  const bodySize = bodySizeOf(sizes)

  const lines: string[] = []
  const walk = (el: Element, depth: number) =>
    kids(el).forEach((c) => {
      const text = c.textContent?.trim() || ''
      if (c.localName === 'h') lines.push(`# ${text}`)
      else if (c.localName === 'p' && text) {
        const { bold, size } = look(c)
        lines.push(depth ? `${'  '.repeat(depth - 1)}- ${text}` : asListItem(text, 0) ?? (isBigBold(text, bold, size, bodySize) ? `# ${text}` : text))
      }
      else if (c.localName === 'list') kids(c, 'list-item').forEach((li) => walk(li, depth + 1))
      else if (c.localName === 'section') walk(c, depth)
    })
  walk(body, 0)
  return { kind: 'text', text: lines.join('\n') }
}

// ── HTML (a page saved from a browser, or a doc exported as a web page) ──────
function htmlToImport(src: string): ImportFile {
  const doc = new DOMParser().parseFromString(src, 'text/html')
  const tables = Array.from(doc.querySelectorAll('table')).map((t) =>
    tidy(Array.from(t.querySelectorAll('tr'), (tr) => Array.from(tr.querySelectorAll('th,td'), (c) => (c.textContent || '').replace(/\s+/g, ' ').trim()))),
  )
  const taskTable = tables.find(isTaskTable)
  if (taskTable) return { kind: 'table', rows: taskTable }

  const lines: string[] = []
  const own = (el: Element) =>
    Array.from(el.childNodes)
      .filter((n) => !(n instanceof Element && /^(UL|OL)$/.test(n.tagName)))
      .map((n) => n.textContent)
      .join('')
      .replace(/\s+/g, ' ')
      .trim()
  const walk = (el: Element, depth: number) =>
    Array.from(el.children).forEach((c) => {
      const tag = c.tagName
      if (/^H[1-6]$/.test(tag)) own(c) && lines.push(`# ${own(c)}`)
      else if (tag === 'UL' || tag === 'OL') walk(c, depth + 1)
      else if (tag === 'LI') {
        own(c) && lines.push(`${'  '.repeat(Math.max(0, depth - 1))}- ${own(c)}`)
        Array.from(c.children).forEach((x) => /^(UL|OL)$/.test(x.tagName) && walk(x, depth + 1))
      } else if (/^(SCRIPT|STYLE|TABLE|NAV|HEADER|FOOTER)$/.test(tag)) return
      else if (/^(P|PRE|BLOCKQUOTE)$/.test(tag) || !c.children.length) own(c) && lines.push(own(c))
      else walk(c, depth)
    })
  walk(doc.body, 0)
  return { kind: 'text', text: lines.join('\n') }
}

// ── Rich Text (.rtf: TextEdit, WordPad) ───────────────────────────────────────
// Keeps the text, paragraph breaks, list bullets and big bold headings; drops fonts, colours, styles and pictures
const RTF_SKIP = new Set(['fonttbl', 'colortbl', 'expandedcolortbl', 'stylesheet', 'info', 'pict', 'header', 'footer', 'listtable', 'listoverridetable', 'generator', 'themedata', 'datastore', 'latentstyles'])
export function rtfToText(src: string) {
  const cp1252 = new TextDecoder('windows-1252')
  type Group = { skip: boolean; uc: number; b: boolean; fs: number }
  const stack: Group[] = []
  let g: Group = { skip: false, uc: 1, b: false, fs: 24 }
  let out = ''
  let skipChars = 0 // characters to skip after \uN (its plain-text fallback)
  // Per line: is all its text bold, and its biggest size (for headings)
  const lineLook: { bold: boolean; size: number }[] = []
  let cur = { bold: true, size: 0, text: false }
  const sizes = new Map<number, number>()
  const emit = (s: string) => {
    if (g.skip) return
    if (skipChars > 0) return void skipChars--
    out += s
    if (s === '\n') {
      lineLook.push({ bold: cur.text && cur.bold, size: cur.size })
      cur = { bold: true, size: 0, text: false }
    } else if (s.trim() && !s.startsWith('\u0001') && s !== '•') {
      cur.text = true
      cur.bold &&= g.b
      cur.size = Math.max(cur.size, g.fs)
      sizes.set(g.fs, (sizes.get(g.fs) || 0) + s.length)
    }
  }
  for (let i = 0; i < src.length; i++) {
    const c = src[i]
    if (c === '{') stack.push(g), (g = { ...g })
    else if (c === '}') g = stack.pop() || { skip: false, uc: 1, b: false, fs: 24 }
    else if (c === '\\') {
      const n = src[i + 1]
      if (n === '\\' || n === '{' || n === '}') emit(n), i++
      else if (n === "'") emit(cp1252.decode(new Uint8Array([parseInt(src.substr(i + 2, 2), 16)]))), (i += 3)
      else if (n === '*') (g.skip = true), i++
      else if (n === '\n' || n === '\r') emit('\n'), i++
      else if (n === '~') emit(' '), i++
      else {
        const m = /^([a-z]+)(-?\d+)? ?/i.exec(src.slice(i + 1, i + 40))
        if (!m) continue
        i += m[0].length
        const [, word, arg] = m
        if (RTF_SKIP.has(word)) g.skip = true
        else if (word === 'par' || word === 'line' || word === 'row') skipChars = 0, emit('\n')
        else if (word === 'tab' || word === 'cell') emit('\t')
        else if (word === 'bullet') emit('•')
        // List level of this paragraph: a marker that the clean-up below turns into indentation
        else if (word === 'ilvl') emit(`\u0001${arg || 0}\u0001`)
        else if (word === 'uc') g.uc = Number(arg || 1)
        else if (word === 'b') g.b = arg !== '0'
        else if (word === 'fs') g.fs = Number(arg || 24)
        else if (word === 'plain') (g.b = false), (g.fs = 24)
        else if (word === 'u') {
          const code = Number(arg)
          emit(String.fromCharCode(code < 0 ? code + 65536 : code))
          skipChars = g.uc
        }
      }
    } else if (c !== '\n' && c !== '\r') emit(c)
  }
  // TextEdit lists come out as "\t•\tItem" (or "\t1\tItem") with their level marked: make them "- Item", indented
  lineLook.push({ bold: cur.text && cur.bold, size: cur.size })
  const bodySize = bodySizeOf(sizes)
  return out
    .split('\n')
    .map((l, i) => {
      const level = Number(/\u0001(\d+)\u0001/.exec(l)?.[1] || 0)
      const text = l.replace(/\u0001\d+\u0001/g, '').trimEnd()
      const item = asListItem(text, level)
      if (item) return item
      const { bold, size } = lineLook[i] || { bold: false, size: 0 }
      return isBigBold(text.trim(), bold, size, bodySize) ? `# ${text.trim()}` : text.trim()
    })
    .filter((l) => l.trim())
    .join('\n')
}
