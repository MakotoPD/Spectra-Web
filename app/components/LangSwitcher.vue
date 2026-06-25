<script setup lang="ts">
const { locale, locales, setLocale } = useI18n()

const items = computed(() =>
  (locales.value as { code: string, name: string }[]).map(l => ({
    label: l.name,
    icon: l.code === locale.value ? 'i-lucide-check' : undefined,
    onSelect: () => setLocale(l.code as 'en' | 'pl')
  }))
)
</script>

<template>
  <UDropdownMenu :items="items" :content="{ align: 'end' }">
    <UButton
      color="neutral"
      variant="ghost"
      icon="i-lucide-languages"
      :label="locale.toUpperCase()"
      class="font-medium"
    />
  </UDropdownMenu>
</template>
