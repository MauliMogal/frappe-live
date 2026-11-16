import { Avatar } from 'frappe-ui'
import neha from '../assets/avatar-neha.js'
import swarali from '../assets/avatar-swarali.js'
import priya from '../assets/avatar-priya.js'
import karan from '../assets/avatar-karan.js'
import riya from '../assets/avatar-riya.js'
import dev from '../assets/avatar-dev.js'
import tara from '../assets/avatar-tara.js'
import kabir from '../assets/avatar-kabir.js'

// Prototype only: profile photos for some people, so lists don't look like a wall of initials.
// Everyone else keeps their initials (that's realistic: not everyone uploads a photo).
// Instead of touching every <Avatar>, this gives Frappe UI's Avatar a photo when its label is one of these
// names and no image was passed. Photos are placeholder portraits (from pravatar.cc), embedded in the
// prototype (src/assets/avatar-*.js), so they work offline, in checks and in gallery thumbnails.
const PHOTOS: Record<string, string> = { Neha: neha, Swarali: swarali, Priya: priya, Karan: karan, Riya: riya, Dev: dev, Tara: tara, Kabir: kabir }
export const photoFor = (name?: string | null) => (name ? PHOTOS[name] : undefined)

const withPhoto = (props: any) =>
  new Proxy(props, {
    get(target, key) {
      if (key === 'image' && !target.image) return photoFor(target.label)
      return Reflect.get(target, key)
    },
  })
const A: any = Avatar
if (A && !A.__withPhotos && typeof A.setup === 'function') {
  const setup = A.setup
  A.setup = (props: any, ctx: any) => setup(withPhoto(props), ctx)
  // Studio's dev server compiles the template apart from setup, and it reads $props (the 3rd argument)
  if (typeof A.render === 'function') {
    const render = A.render
    A.render = (ctx: any, cache: any, $props: any, ...rest: any[]) => render(ctx, cache, withPhoto($props), ...rest)
  }
  A.__withPhotos = true
}
