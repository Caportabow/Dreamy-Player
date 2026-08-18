<template>
  <div aria-hidden="true" class="pointer-events-none fixed inset-0 overflow-hidden">
    <!-- oversized blurred colour clouds -->
    <div class="absolute -top-[18%] -left-[12%] h-[60vh] w-[60vw] rounded-full bg-plum-700/25 blur-[120px] animate-aurora" />
    <div
      class="absolute top-[22%] -right-[16%] h-[55vh] w-[50vw] rounded-full bg-violet-700/20 blur-[130px] animate-aurora"
      style="animation-delay: -9s"
    />
    <div
      class="absolute -bottom-[22%] left-[18%] h-[60vh] w-[58vw] rounded-full bg-plum-800/30 blur-[120px] animate-aurora"
      style="animation-delay: -17s"
    />
    <div
      class="absolute top-[8%] left-[38%] h-[40vh] w-[34vw] rounded-full bg-lavender-400/8 blur-[110px] animate-breathe"
    />

    <!-- soft vignette -->
    <div
      class="absolute inset-0"
      style="
        background:
          radial-gradient(120% 90% at 50% 0%, transparent 55%, rgba(5, 3, 10, 0.5) 100%),
          radial-gradient(90% 80% at 50% 110%, rgba(5, 3, 10, 0.55) 0%, transparent 60%);
      "
    />

    <!-- grain -->
    <div class="noise absolute inset-0 opacity-70" />
  </div>
</template>
