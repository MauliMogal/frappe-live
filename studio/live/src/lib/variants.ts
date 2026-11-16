import { computed, defineComponent, reactive } from 'vue'

// Replaces Sketch's `sketch:variants`. In the prototype, <Variants> sat inside components and Sketch's pill
// switched its slots. Here every variant set is a Studio Variants block on the page it belongs to: each option
// holds a DesignChoice (design options, lib/look.ts) or a DemoChoice (demo states, below). Studio's own pill
// switches them, in the editor canvas and in the running app. So the in-component <Variants> renders nothing.
export const Variants = defineComponent({
  name: 'Variants',
  props: { name: String },
  setup: () => () => null,
})

// Demo states (Sketch's useDemoState), e.g. "Invite from". Set by DemoChoice blocks.
// "View as" is gone (people sign in for real) and so is "Data: Empty" (it would delete real records).
export const demo = reactive<Record<string, string>>({})

export function useDemoState(name: string, options: string[]) {
  return computed(() => demo[name] ?? options[0])
}
