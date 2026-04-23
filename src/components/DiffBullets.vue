<script setup lang="ts">
import { computed } from 'vue'
import { computeBulletDiff } from '../services/diffText'

const props = defineProps<{ before: string[]; after: string[]; showDiff: boolean }>()

import type { BulletDiffPair } from '../services/diffText'

const pairs = computed<BulletDiffPair[]>(() => {
  if (!props.showDiff) {
    return (props.after ?? []).map((a) => ({ kind: 'equal', after: a }))
  }
  return computeBulletDiff(props.before ?? [], props.after ?? [])
})
</script>

<template>
  <ul class="mt-2 space-y-2 text-[14px] text-ink-800 list-none">
    <li
      v-for="(p, idx) in pairs"
      :key="idx"
      class="flex gap-2"
      :class="{
        'opacity-60': p.kind === 'removed'
      }"
    >
      <span class="mt-[8px] w-1.5 h-1.5 rounded-full shrink-0"
        :class="{
          'bg-emerald-500': p.kind === 'added',
          'bg-rose-400': p.kind === 'removed',
          'bg-amber-400': p.kind === 'modified',
          'bg-ink-300': p.kind === 'equal'
        }"
      />
      <div class="flex-1 leading-relaxed">
        <template v-if="p.kind === 'modified' && p.spans">
          <span>
            <template v-for="(s, i) in p.spans" :key="i">
              <span v-if="s.type === 'added'" class="diff-added">{{ s.text }}</span>
              <span v-else-if="s.type === 'removed'" class="diff-removed">{{ s.text }}</span>
              <span v-else>{{ s.text }}</span>
            </template>
          </span>
        </template>
        <template v-else-if="p.kind === 'removed'">
          <span class="diff-removed-line">{{ p.before }}</span>
        </template>
        <template v-else>
          {{ p.after ?? p.before }}
        </template>
      </div>
    </li>
  </ul>
</template>
