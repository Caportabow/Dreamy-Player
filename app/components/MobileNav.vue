<script setup lang="ts">
import { mediaUrl } from '~/types/music'
import { useAuthStore } from '~/stores/auth'

const route = useRoute()
const auth = useAuthStore()

// Shared with the desktop sidebar — see ~/utils/navigation.
const items = mainNavItems

const avatarUrl = computed(() => mediaUrl(auth.user?.profile?.avatarKey))

function isActive(to: string): boolean {
  return isMainNavActive(route.path, to)
}
</script>

<template>
  <nav
    class="fixed inset-x-0 bottom-0 z-30 border-t border-white/6 bg-night-900/85 pb-[env(safe-area-inset-bottom)] backdrop-blur-2xl lg:hidden"
    aria-label="Bottom navigation"
  >
    <div class="grid grid-cols-5">
      <NuxtLink
        v-for="item in items"
        :key="item.to"
        :to="item.to"
        class="flex flex-col items-center gap-0.5 py-2 text-[10px] transition-colors"
        :class="isActive(item.to) ? 'text-lavender-200' : 'text-cream-faint hover:text-cream-muted'"
      >
        <span
          class="flex h-7 w-14 items-center justify-center rounded-full transition-all duration-300"
          :class="
            isActive(item.to)
              ? 'bg-lavender-400/15 shadow-[0_0_18px_-4px_rgba(140,110,200,0.5)]'
              : ''
          "
        >
          <!-- The Profile tab wears the user's avatar instead of a generic icon -->
          <img
            v-if="item.to === '/profile' && avatarUrl"
            :src="avatarUrl"
            :alt="`${auth.displayName} avatar`"
            class="h-5 w-5 rounded-full object-cover"
          />
          <component v-else :is="item.icon" class="h-5 w-5" />
        </span>
        {{ item.label }}
      </NuxtLink>
    </div>
  </nav>
</template>
