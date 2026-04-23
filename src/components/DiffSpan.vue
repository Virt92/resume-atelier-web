<script setup lang="ts">
import { computed } from 'vue'
import { computeDiff } from '../services/diffText'

const props = defineProps<{ before: string; after: string }>()
const spans = computed(() => computeDiff(props.before, props.after))
</script>

<template>
  <span>
    <template v-for="(s, idx) in spans" :key="idx">
      <span v-if="s.type === 'added'" class="diff-added">{{ s.text }}</span>
      <span v-else-if="s.type === 'removed'" class="diff-removed">{{ s.text }}</span>
      <span v-else>{{ s.text }}</span>
    </template>
  </span>
</template>
