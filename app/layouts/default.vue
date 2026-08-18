<script setup lang="ts">
import { Menu } from 'lucide-vue-next'
import { useAuthStore } from '~/stores/auth'

const auth = useAuthStore()
const sheetOpen = ref(false)
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

    <!-- Mobile top bar (signed-in users only) -->
    <header v-if="auth.isSignedIn" class="sticky top-0 z-30 flex items-center justify-between px-4 py-3 backdrop-blur-xl lg:hidden">
      <NuxtLink to="/" class="flex items-center gap-2.5">
        <AppLogo :size="30" />
        <span class="font-display text-lg font-semibold text-cream">Dreamy</span>
      </NuxtLink>
      <Sheet v-model:open="sheetOpen">
        <SheetTrigger as-child>
          <button
            type="button"
            class="rounded-full bg-white/5 p-2.5 text-cream-muted backdrop-blur-md transition-colors hover:bg-white/10 hover:text-cream"
            aria-label="Open menu"
          >
            <Menu class="h-5 w-5" />
          </button>
        </SheetTrigger>
        <SheetContent side="left" class="w-[85%] max-w-xs p-5">
          <SheetHeader class="sr-only">
            <SheetTitle>Menu</SheetTitle>
            <SheetDescription>Primary navigation</SheetDescription>
          </SheetHeader>
          <AppSidebar @navigate="sheetOpen = false" />
        </SheetContent>
      </Sheet>
    </header>

    <!-- Main content -->
    <main class="mx-auto w-full min-w-0 max-w-[1200px] flex-1 px-4 pb-48 pt-4 sm:px-6 lg:pb-36 lg:pt-8">
      <NuxtPage />
    </main>

    <MobileNav v-if="auth.isSignedIn" />
    <!-- The player only exists for signed-in users; guests cannot stream media. -->
    <BottomPlayer v-if="auth.isSignedIn" />
    <ExpandedPlayer v-if="auth.isSignedIn" />
  </div>
</template>
