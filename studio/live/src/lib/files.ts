// Turn a picked File into an attachment record. Nothing is uploaded; it lives in memory.
export function sizeText(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export function fileToAttachment(file: File) {
  const isImage = file.type.startsWith('image/')
  return {
    type: isImage ? 'image' : 'document',
    name: file.name,
    size: sizeText(file.size),
    preview: isImage ? URL.createObjectURL(file) : null,
  }
}

// Frappe UI FileUploader gives back a file record ({ file_name, file_url, file_size }).
export function uploadedToAttachment(rec: any) {
  const name = rec?.file_name || 'File'
  const isImage = /\.(png|jpe?g|gif|webp|svg)$/i.test(name)
  return {
    type: isImage ? 'image' : 'document',
    name,
    size: rec?.file_size ? sizeText(rec.file_size) : '',
    url: rec?.file_url || null,
    preview: null,
  }
}

export function linkToAttachment(url: string) {
  const clean = /^https?:\/\//.test(url) ? url : `https://${url}`
  let name = clean
  try {
    const u = new URL(clean)
    const host = u.host.replace('www.', '')
    if (host.includes('figma.com')) name = 'Figma file'
    else if (host.includes('github.com')) name = `GitHub · ${u.pathname.split('/').filter(Boolean).slice(-2).join('/')}`
    else if (host.includes('docs.google.com')) name = 'Google Doc'
    else name = host + (u.pathname !== '/' ? u.pathname : '')
  } catch {}
  return { type: 'link', name, url: clean }
}

// Who you can assign to: anyone in the workspace (assigning adds them to the project if needed).
// Project members come first in pickers; the new user only appears once they've signed up.
export function membersOf(space: string, people: any[], project: (id: string) => any) {
  const all = people.filter((p) => p.id !== 'newbie' || p.onboarded).map((p) => p.id)
  if (space === 'general') return all
  const members = project(space)?.members.map((m: any) => m.user) || []
  return [...members, ...all.filter((id) => !members.includes(id))]
}
