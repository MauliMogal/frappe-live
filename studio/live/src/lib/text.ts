import { state } from './store'

export function escapeHtml(s: string) {
  return (s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// @Name becomes darker, medium weight. No blue links (docs/05).
export function renderMentions(text: string) {
  let html = escapeHtml(text)
  state.people.forEach((p) => {
    html = html.replace(
      new RegExp(`@${p.name}\\b`, 'gi'),
      `<span class="font-medium text-ink-gray-9">@${p.name}</span>`,
    )
  })
  return html.replace(/\n/g, '<br>')
}

// Plain text from the description editor -> simple paragraphs.
export function textToHtml(text: string) {
  return text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${escapeHtml(p).replace(/\n/g, '<br>')}</p>`)
    .join('')
}
export function htmlToText(html: string) {
  return (html || '')
    .replace(/<br\s*\/?>/g, '\n')
    .replace(/<\/p>\s*<p>/g, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
}
