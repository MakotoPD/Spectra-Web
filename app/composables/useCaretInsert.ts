// Dropping text into whichever field the caret is in.
//
// The alternative — a picker per input, each appending to the end — is worse in
// the one case that matters: an emoji belongs in the middle of a sentence far
// more often than at the end of it.
//
// This works because the picker's buttons use `@mousedown.prevent`, which stops
// the browser moving focus when they are pressed. Without that, clicking the
// picker blurs the textarea and `document.activeElement` is the button.

/** Fields the caret can be in. Nuxt UI renders real inputs, so this covers it. */
type Field = HTMLInputElement | HTMLTextAreaElement

function focusedField(): Field | null {
  const el = document.activeElement
  if (!el) return null
  const tag = el.tagName
  if (tag !== 'INPUT' && tag !== 'TEXTAREA') return null
  // Colour and checkbox inputs have no text to insert into, and reading
  // selectionStart on them throws in some browsers.
  const field = el as Field
  if (field instanceof HTMLInputElement && !['text', 'search', 'url', ''].includes(field.type)) {
    return null
  }
  return field
}

/**
 * Inserts `text` at the caret of the focused field, replacing any selection.
 * Returns false when nothing was focused, so the caller can fall back.
 */
export function insertAtCaret(text: string): boolean {
  const field = focusedField()
  if (!field) return false

  const start = field.selectionStart ?? field.value.length
  const end = field.selectionEnd ?? start
  field.value = field.value.slice(0, start) + text + field.value.slice(end)

  // Vue binds with `v-model`, which listens for `input`. Assigning `.value`
  // directly does not fire one, so the model would never see the change.
  field.dispatchEvent(new Event('input', { bubbles: true }))

  const caret = start + text.length
  field.setSelectionRange(caret, caret)
  field.focus()
  return true
}
