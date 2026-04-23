<script setup lang="ts">
import { useSessionStore } from '../stores/session'

const store = useSessionStore()
</script>

<template>
  <div class="card p-5">
    <div class="flex items-center justify-between mb-3">
      <div>
        <div class="label">Progress</div>
        <div class="font-display text-lg font-semibold">Pipeline</div>
      </div>
      <div v-if="store.isRunning" class="text-xs text-accent-700 font-medium">Running…</div>
      <div v-else-if="store.isDone" class="text-xs text-emerald-700 font-medium">Done</div>
    </div>

    <ol class="space-y-2">
      <li
        v-for="stage in store.stages"
        :key="stage.id"
        class="flex items-center gap-3 text-sm"
      >
        <span
          class="h-6 w-6 rounded-full flex items-center justify-center text-[11px] font-bold"
          :class="{
            'bg-ink-100 text-ink-500': stage.status === 'pending',
            'bg-accent-100 text-accent-700 animate-pulse': stage.status === 'running',
            'bg-emerald-100 text-emerald-700': stage.status === 'done',
            'bg-rose-100 text-rose-700': stage.status === 'error',
            'bg-ink-100 text-ink-400': stage.status === 'skipped'
          }"
        >
          <template v-if="stage.status === 'done'">✓</template>
          <template v-else-if="stage.status === 'error'">!</template>
          <template v-else-if="stage.status === 'skipped'">–</template>
          <template v-else>·</template>
        </span>
        <span
          :class="[
            stage.status === 'pending' ? 'text-ink-500' : 'text-ink-900',
            stage.status === 'running' ? 'font-medium' : ''
          ]"
        >
          {{ stage.label }}
        </span>
        <span v-if="stage.error" class="text-xs text-rose-600 truncate">— {{ stage.error }}</span>
      </li>
    </ol>
  </div>
</template>
