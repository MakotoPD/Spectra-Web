<script setup lang="ts">
// One embed, edited field by field.
//
// The shape is Discord's own, not a friendlier one of our own invention: what
// this produces is what goes on the wire. `image` and `thumbnail` are `{ url }`
// objects because the API says so, and flattening them here would only mean
// unflattening them somewhere less visible.
//
// Every counter is the real limit from the API reference. They exist so the
// message is not written, sent, and only then refused.

export interface EmbedField { name: string, value: string, inline: boolean }

export interface EmbedDraft {
  title: string
  description: string
  url: string
  color: string
  author: { name: string, url: string, icon_url: string }
  footer: { text: string, icon_url: string }
  image: { url: string }
  thumbnail: { url: string }
  fields: EmbedField[]
  timestamp: boolean
}

const embed = defineModel<EmbedDraft>({ required: true })

const LIMITS = {
  title: 256,
  description: 4096,
  authorName: 256,
  footer: 2048,
  fieldName: 256,
  fieldValue: 1024,
  fields: 25,
}

/** Only the title section starts open — the rest are usually left alone. */
const open = reactive({ author: false, body: true, images: false, fields: false, footer: false })

/** A short preview of what a collapsed section holds, so it need not be opened. */
const summary = (text: string, max = 24) =>
  !text ? '' : text.length > max ? `${text.slice(0, max)}…` : text

function addField() {
  if (embed.value.fields.length >= LIMITS.fields) return
  embed.value.fields.push({ name: '', value: '', inline: false })
}

/** Discord counts these six toward the 6000-per-message budget, nothing else. */
const usedCharacters = computed(() =>
  embed.value.title.length
  + embed.value.description.length
  + embed.value.author.name.length
  + embed.value.footer.text.length
  + embed.value.fields.reduce((sum, f) => sum + f.name.length + f.value.length, 0))

defineExpose({ usedCharacters })

/** Discord's own blurple, and the palette its client uses for embeds. */
const SWATCHES = ['#5865f2', '#38bdf8', '#57f287', '#fee75c', '#faa61a', '#ed4245', '#eb459e', '#2b2d31']
</script>

<template>
  <div class="space-y-2">
    <!-- colour -->
    <div class="flex items-center gap-3 rounded-lg bg-white/[0.03] p-3">
      <span class="size-7 shrink-0 rounded-full border border-white/15" :style="{ background: embed.color }" />
      <div class="min-w-0">
        <p class="text-sm font-medium">Colour bar</p>
        <p class="font-mono text-[11px] text-white/40">{{ embed.color }}</p>
      </div>
      <div class="ms-auto flex items-center gap-1.5">
        <button
          v-for="swatch in SWATCHES" :key="swatch" type="button"
          class="size-5 rounded-full border border-white/15 transition hover:scale-110"
          :style="{ background: swatch }" :title="swatch"
          @click="embed.color = swatch"
        />
        <input v-model="embed.color" type="color" class="size-7 cursor-pointer rounded border-0 bg-transparent p-0">
      </div>
    </div>

    <!-- author -->
    <div class="overflow-hidden rounded-lg border border-white/8">
      <button type="button" class="flex w-full items-center gap-2 bg-white/[0.03] px-3 py-2 text-left transition hover:bg-white/[0.06]" @click="open.author = !open.author">
        <UIcon name="i-lucide-user" class="size-4 text-white/40" />
        <span class="text-sm font-medium">Author</span>
        <span v-if="embed.author.name" class="truncate text-[11px] text-white/35">{{ summary(embed.author.name) }}</span>
        <UIcon :name="open.author ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'" class="ms-auto size-4 text-white/40" />
      </button>
      <div v-show="open.author" class="space-y-2 border-t border-white/8 p-3">
        <div>
          <label class="mb-1 block text-[11px] text-white/40">Name <span class="text-white/25">({{ embed.author.name.length }}/{{ LIMITS.authorName }})</span></label>
          <UInput v-model="embed.author.name" :maxlength="LIMITS.authorName" size="sm" class="w-full" />
        </div>
        <div>
          <label class="mb-1 block text-[11px] text-white/40">Link</label>
          <UInput v-model="embed.author.url" size="sm" class="w-full" placeholder="https://…" />
        </div>
        <div>
          <label class="mb-1 block text-[11px] text-white/40">Icon URL</label>
          <UInput v-model="embed.author.icon_url" size="sm" class="w-full" placeholder="https://….png" />
        </div>
      </div>
    </div>

    <!-- title & description -->
    <div class="overflow-hidden rounded-lg border border-white/8">
      <button type="button" class="flex w-full items-center gap-2 bg-white/[0.03] px-3 py-2 text-left transition hover:bg-white/[0.06]" @click="open.body = !open.body">
        <UIcon name="i-lucide-heading" class="size-4 text-white/40" />
        <span class="text-sm font-medium">Title and text</span>
        <span v-if="embed.title" class="truncate text-[11px] text-white/35">{{ summary(embed.title) }}</span>
        <UIcon :name="open.body ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'" class="ms-auto size-4 text-white/40" />
      </button>
      <div v-show="open.body" class="space-y-2 border-t border-white/8 p-3">
        <div>
          <label class="mb-1 block text-[11px] text-white/40">Title <span class="text-white/25">({{ embed.title.length }}/{{ LIMITS.title }})</span></label>
          <UInput v-model="embed.title" :maxlength="LIMITS.title" size="sm" class="w-full" />
        </div>
        <div>
          <label class="mb-1 block text-[11px] text-white/40">Title link</label>
          <UInput v-model="embed.url" size="sm" class="w-full" placeholder="https://…" />
        </div>
        <div>
          <label class="mb-1 block text-[11px] text-white/40">
            Description <span class="text-white/25">({{ embed.description.length }}/{{ LIMITS.description }})</span>
            <span class="ms-1 text-white/25">— markdown works</span>
          </label>
          <UTextarea v-model="embed.description" :maxlength="LIMITS.description" :rows="5" class="w-full" />
        </div>
      </div>
    </div>

    <!-- images -->
    <div class="overflow-hidden rounded-lg border border-white/8">
      <button type="button" class="flex w-full items-center gap-2 bg-white/[0.03] px-3 py-2 text-left transition hover:bg-white/[0.06]" @click="open.images = !open.images">
        <UIcon name="i-lucide-image" class="size-4 text-white/40" />
        <span class="text-sm font-medium">Images</span>
        <span v-if="embed.image.url || embed.thumbnail.url" class="text-[11px] text-white/35">set</span>
        <UIcon :name="open.images ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'" class="ms-auto size-4 text-white/40" />
      </button>
      <div v-show="open.images" class="space-y-2 border-t border-white/8 p-3">
        <div>
          <label class="mb-1 block text-[11px] text-white/40">Large image (below the text)</label>
          <UInput v-model="embed.image.url" size="sm" class="w-full" placeholder="https://….png" />
        </div>
        <div>
          <label class="mb-1 block text-[11px] text-white/40">Thumbnail (small, top right)</label>
          <UInput v-model="embed.thumbnail.url" size="sm" class="w-full" placeholder="https://….png" />
        </div>
      </div>
    </div>

    <!-- fields -->
    <div class="overflow-hidden rounded-lg border border-white/8">
      <button type="button" class="flex w-full items-center gap-2 bg-white/[0.03] px-3 py-2 text-left transition hover:bg-white/[0.06]" @click="open.fields = !open.fields">
        <UIcon name="i-lucide-table-2" class="size-4 text-white/40" />
        <span class="text-sm font-medium">Fields</span>
        <span v-if="embed.fields.length" class="text-[11px] text-white/35">{{ embed.fields.length }}/{{ LIMITS.fields }}</span>
        <UIcon :name="open.fields ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'" class="ms-auto size-4 text-white/40" />
      </button>
      <div v-show="open.fields" class="space-y-2 border-t border-white/8 p-3">
        <div v-for="(field, i) in embed.fields" :key="i" class="rounded-lg bg-white/[0.03] p-2.5">
          <div class="mb-2 flex items-center gap-2">
            <span class="text-[11px] font-medium text-white/40">Field {{ i + 1 }}</span>
            <!-- Discord lays inline fields out three to a row; a non-inline one
                 always takes the full width. -->
            <UCheckbox v-model="field.inline" label="Inline" :ui="{ label: 'text-[11px]' }" />
            <UButton
              class="ms-auto" size="xs" color="error" variant="ghost" icon="i-lucide-x"
              @click="embed.fields.splice(i, 1)"
            />
          </div>
          <UInput
            v-model="field.name" :maxlength="LIMITS.fieldName" size="sm" class="mb-1.5 w-full"
            :placeholder="`Name (max ${LIMITS.fieldName})`"
          />
          <UTextarea
            v-model="field.value" :maxlength="LIMITS.fieldValue" :rows="2" class="w-full"
            :placeholder="`Value (max ${LIMITS.fieldValue})`"
          />
        </div>
        <UButton
          size="xs" color="neutral" variant="soft" icon="i-lucide-plus" label="Add field"
          :disabled="embed.fields.length >= LIMITS.fields"
          @click="addField"
        />
      </div>
    </div>

    <!-- footer -->
    <div class="overflow-hidden rounded-lg border border-white/8">
      <button type="button" class="flex w-full items-center gap-2 bg-white/[0.03] px-3 py-2 text-left transition hover:bg-white/[0.06]" @click="open.footer = !open.footer">
        <UIcon name="i-lucide-panel-bottom" class="size-4 text-white/40" />
        <span class="text-sm font-medium">Footer</span>
        <span v-if="embed.footer.text" class="truncate text-[11px] text-white/35">{{ summary(embed.footer.text) }}</span>
        <UIcon :name="open.footer ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'" class="ms-auto size-4 text-white/40" />
      </button>
      <div v-show="open.footer" class="space-y-2 border-t border-white/8 p-3">
        <div>
          <label class="mb-1 block text-[11px] text-white/40">Text <span class="text-white/25">({{ embed.footer.text.length }}/{{ LIMITS.footer }})</span></label>
          <UInput v-model="embed.footer.text" :maxlength="LIMITS.footer" size="sm" class="w-full" />
        </div>
        <div>
          <label class="mb-1 block text-[11px] text-white/40">Icon URL</label>
          <UInput v-model="embed.footer.icon_url" size="sm" class="w-full" placeholder="https://….png" />
        </div>
        <UCheckbox v-model="embed.timestamp" label="Show a timestamp" :ui="{ label: 'text-xs' }" />
      </div>
    </div>
  </div>
</template>
