<script setup lang="ts">
import { mediaUrl } from '~/types/music'
import { useAuthStore } from '~/stores/auth'

withDefaults(
  defineProps<{
    /** Tighter pill layout for narrow bars (the mobile navbar). */
    compact?: boolean
    /** Whether the current route is the profile page. */
    active?: boolean
  }>(),
  { compact: false, active: false },
)
const emit = defineEmits<{ navigate: [] }>()

const auth = useAuthStore()

const avatarUrl = computed(() => mediaUrl(auth.user?.profile?.avatarKey))

/** Fallback for accounts without an avatar: initials on a soft gradient. */
function initials(): string {
  const name = auth.displayName || auth.user?.username || '?'
  return name
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('')
}

function go(): void {
  emit('navigate')
  navigateTo('/profile')
}
</script>

<template>
  <button
    type="button"
    class="group flex items-center gap-2.5 rounded-pillow-sm text-left transition-all duration-300"
    :class="[
      compact
        ? 'min-w-0 border border-white/6 bg-white/4 p-1.5 pr-3 hover:border-white/10 hover:bg-white/8'
        : 'w-full px-3 py-2.5 hover:translate-x-0.5 hover:bg-white/5',
      active
        ? 'bg-white/7 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06),0_0_30px_-8px_rgba(140,110,200,0.4)]'
        : '',
    ]"
    :aria-label="`Open your profile — ${auth.displayName}`"
    @click="go"
  >
    <!-- Avatar: uploaded picture, or initials on a soft gradient -->
    <span
      class="relative shrink-0 overflow-hidden rounded-full border border-white/8 shadow-inner-soft"
      :class="compact ? 'h-7 w-7' : 'h-10 w-10'"
    >
      <img
        v-if="avatarUrl"
        :src="avatarUrl"
        :alt="`${auth.displayName} avatar`"
        class="h-full w-full object-cover"
      />
      <span
        v-else
        class="flex h-full w-full items-center justify-center bg-gradient-to-br from-lavender-400/70 to-plum-600/70 text-sm font-semibold text-night-950"
        :class="compact ? 'text-[10px]' : 'text-sm'"
      >
        {{ initials() }}
      </span>
    </span>

    <!-- Display name + username -->
    <span class="min-w-0 flex-1">
      <span class="block truncate font-medium text-cream" :class="compact ? 'text-[13px]' : 'text-sm'">
        {{ auth.displayName }}
      </span>
      <span class="block truncate text-cream-dim" :class="compact ? 'text-[11px]' : 'text-xs'">
        @{{ auth.user?.username }}
      </span>
    </span>
  </button>
</template>
