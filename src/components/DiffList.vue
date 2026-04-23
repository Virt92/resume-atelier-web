<script setup lang="ts">
import { computed } from 'vue'
import { computeListDiff } from '../services/diffText'

const props = defineProps<{ before: string[]; after: string[]; showDiff: boolean }>()

const items = computed(() =>
  props.showDiff
    ? computeListDiff(props.before ?? [], props.after ?? [])
    : (props.after ?? []).map((v) => ({ type: 'equal' as const, value: v }))
)
</script>

<template>
  <div class="flex flex-wrap gap-1.5">
    <span
      v-for="(it, idx) in items"
      :key="idx"
      class="skill-pill"
      :class="{
        'skill-pill--added': it.type === 'added',
        'skill-pill--removed': it.type === 'removed'
      }"
    >
      {{ it.value }}
    </span>
  </div>
</template>
