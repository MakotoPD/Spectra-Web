<script setup lang="ts">
// What the message will look like in Discord.
//
// Worth the effort because an embed is not laid out the way its editor is: the
// thumbnail sits beside the text rather than under it, inline fields pack three
// to a row, and the colour bar is on the left. Reading those from a form is
// guesswork; the point of a preview is to stop guessing.
//
// The markdown here is Discord's subset, not CommonMark — no headings, no
// images, and `__underline__` rather than italic.

import type { EmbedDraft } from './DiscordEmbedBuilder.vue'
import type { RowDraft } from './DiscordComponentsBuilder.vue'

const props = defineProps<{
  content: string
  embeds: EmbedDraft[]
  components: RowDraft[]
  botName?: string
}>()

const BUTTON_CSS: Record<number, string> = {
  1: 'bg-[#5865f2] text-white',
  2: 'bg-[#4e5058] text-white',
  3: 'bg-[#248046] text-white',
  4: 'bg-[#da373c] text-white',
  5: 'bg-[#4e5058] text-white',
}

/**
 * Discord's markdown, rendered.
 *
 * Escaped first, then formatted: the input is text an admin typed, and it ends
 * up as innerHTML. Doing it the other way round would make `<img onerror=…>` in
 * a description into markup that runs.
 */
function renderMarkdown(text: string): string {
  if (!text) return ''
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\*\*\*(.+?)\*\*\*/gs, '<strong><em>$1</em></strong>')
    .replace(/\*\*(.+?)\*\*/gs, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/gs, '<em>$1</em>')
    // Underline in Discord, not italic — the one place it parts with CommonMark.
    .replace(/__(.+?)__/gs, '<u>$1</u>')
    .replace(/~~(.+?)~~/gs, '<del>$1</del>')
    .replace(/`([^`]+)`/g, '<code class="rounded bg-black/40 px-1 font-mono text-[0.85em]">$1</code>')
    .replace(/^&gt; (.+)$/gm, '<span class="block border-l-2 border-white/25 pl-2 text-white/60">$1</span>')
    .replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, '<span class="text-[#00a8fc]">$1</span>')
    .replace(/\n/g, '<br>')
}

const hasEmbed = (embed: EmbedDraft) =>
  embed.title || embed.description || embed.author.name || embed.footer.text
  || embed.image.url || embed.thumbnail.url || embed.fields.some(f => f.name && f.value)

const visibleEmbeds = computed(() => props.embeds.filter(hasEmbed))
const visibleRows = computed(() => props.components.filter(r => r.components.length))

const isEmpty = computed(() =>
  !props.content.trim() && !visibleEmbeds.value.length)

const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

/**
 * Inline fields sit three to a row; a non-inline one always spans the width.
 * Modelled with a 3-column grid, which is what Discord's own layout amounts to.
 */
const fieldStyle = (inline: boolean) => inline ? {} : { gridColumn: '1 / -1' }
</script>

<template>
  <div class="rounded-lg bg-[#313338] p-4 text-[15px] leading-[1.375] text-[#dbdee1]">
    <div class="flex gap-3">
      <div class="flex size-10 shrink-0 items-center justify-center rounded-full bg-[#5865f2] text-sm font-bold text-white">
        {{ (botName || 'B').charAt(0).toUpperCase() }}
      </div>

      <div class="min-w-0 flex-1">
        <div class="flex items-baseline gap-2">
          <span class="font-medium text-white">{{ botName || 'Spectra' }}</span>
          <span class="rounded bg-[#5865f2] px-1 text-[10px] font-bold uppercase text-white">Bot</span>
          <span class="text-[11px] text-[#949ba4]">today at {{ now }}</span>
        </div>

        <p v-if="isEmpty" class="mt-1 text-[#949ba4] italic">Nothing to show yet.</p>

        <!-- eslint-disable-next-line vue/no-v-html -- escaped in renderMarkdown -->
        <div v-if="content.trim()" class="mt-0.5 break-words" v-html="renderMarkdown(content)" />

        <!-- embeds -->
        <div
          v-for="(embed, i) in visibleEmbeds" :key="i"
          class="mt-2 max-w-[520px] overflow-hidden rounded border-l-4 bg-[#2b2d31]"
          :style="{ borderLeftColor: embed.color || '#5865f2' }"
        >
          <div class="flex gap-4 p-3">
            <div class="min-w-0 flex-1">
              <div v-if="embed.author.name" class="mb-1.5 flex items-center gap-2">
                <img v-if="embed.author.icon_url" :src="embed.author.icon_url" alt="" class="size-6 rounded-full object-cover">
                <span class="text-[14px] font-medium text-white">{{ embed.author.name }}</span>
              </div>

              <div v-if="embed.title" class="mb-1 text-[16px] font-semibold" :class="embed.url ? 'text-[#00a8fc]' : 'text-white'">
                {{ embed.title }}
              </div>

              <!-- eslint-disable-next-line vue/no-v-html -- escaped in renderMarkdown -->
              <div v-if="embed.description" class="text-[14px] text-[#dbdee1]" v-html="renderMarkdown(embed.description)" />

              <div
                v-if="embed.fields.some(f => f.name && f.value)"
                class="mt-2 grid gap-2" style="grid-template-columns: repeat(3, minmax(0, 1fr))"
              >
                <div
                  v-for="(field, fi) in embed.fields.filter(f => f.name && f.value)" :key="fi"
                  class="min-w-0" :style="fieldStyle(field.inline)"
                >
                  <div class="text-[14px] font-semibold text-white">{{ field.name }}</div>
                  <!-- eslint-disable-next-line vue/no-v-html -- escaped in renderMarkdown -->
                  <div class="text-[14px] text-[#dbdee1]" v-html="renderMarkdown(field.value)" />
                </div>
              </div>
            </div>

            <!-- Beside the text, not below it — the layout an editor cannot show. -->
            <img
              v-if="embed.thumbnail.url" :src="embed.thumbnail.url" alt=""
              class="size-20 shrink-0 rounded object-cover"
            >
          </div>

          <img v-if="embed.image.url" :src="embed.image.url" alt="" class="w-full object-cover px-3 pb-3">

          <div v-if="embed.footer.text || embed.timestamp" class="flex items-center gap-2 px-3 pb-3 text-[12px] text-[#949ba4]">
            <img v-if="embed.footer.icon_url" :src="embed.footer.icon_url" alt="" class="size-5 rounded-full object-cover">
            <span>{{ embed.footer.text }}</span>
            <span v-if="embed.footer.text && embed.timestamp">•</span>
            <span v-if="embed.timestamp">today at {{ now }}</span>
          </div>
        </div>

        <!-- buttons and dropdowns -->
        <div v-for="(row, ri) in visibleRows" :key="`row-${ri}`" class="mt-2 flex flex-wrap gap-2">
          <template v-for="(component, ci) in row.components" :key="ci">
            <button
              v-if="component.type === 2"
              type="button" disabled
              class="flex items-center gap-1.5 rounded px-4 py-1.5 text-[14px] font-medium"
              :class="BUTTON_CSS[component.style ?? 2]"
            >
              {{ component.label || 'Button' }}
              <UIcon v-if="component.style === 5" name="i-lucide-external-link" class="size-3.5 opacity-70" />
            </button>
            <div
              v-else
              class="flex w-full max-w-[400px] items-center justify-between rounded border border-white/10 bg-[#1e1f22] px-3 py-2 text-[14px] text-[#949ba4]"
            >
              {{ component.placeholder || 'Make a selection' }}
              <UIcon name="i-lucide-chevron-down" class="size-4" />
            </div>
          </template>
        </div>
      </div>
    </div>
  </div>
</template>
