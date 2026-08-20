<script setup lang="ts">
import { useAuthStore } from '~/stores/auth'

const auth = useAuthStore()
</script>

<template>
  <div class="relative flex min-h-screen flex-col lg:flex-row">
    <AmbientBackground />

    <!-- Desktop sidebar (signed-in users only) -->
    <aside v-if="auth.isSignedIn" class="sticky top-0 hidden h-screen w-[19rem] shrink-0 p-4 lg:block">
      <div class="glass flex h-full flex-col overflow-y-auto rounded-pillow-lg p-5">
        <AppSidebar />
      </div>
    </aside>

    <!-- Mobile top bar (signed-in users only): the bottom bar handles
         navigation, so this just carries the brand. -->
    <header
      v-if="auth.isSignedIn"
      class="sticky top-0 z-30 flex items-center justify-center gap-3 px-4 py-3 backdrop-blur-xl lg:hidden"
    >
      <NuxtLink to="/" class="flex items-center gap-2.5">
        <AppLogo :size="30" />
        <span class="font-display text-lg font-semibold text-cream">Dreamy</span>
      </NuxtLink>
    </header>

    <!-- Main content -->
    <main class="mx-auto w-full min-w-0 max-w-[1200px] flex-1 px-4 pb-48 pt-4 sm:px-6 lg:pb-36 lg:pt-8">
      <!-- A gentle, dismissible nudge for accounts without a passkey yet. -->
      <PasskeyNudge v-if="auth.isSignedIn" />
      <NuxtPage />
    </main>

    <MobileNav v-if="auth.isSignedIn" />
    <!-- The player only exists for signed-in users; guests cannot stream media. -->
    <BottomPlayer v-if="auth.isSignedIn" />
    <ExpandedPlayer v-if="auth.isSignedIn" />
    <!-- Download progress follows the user anywhere in the app. -->
    <DownloadProgressCard v-if="auth.isSignedIn" />
  </div>
</template>
