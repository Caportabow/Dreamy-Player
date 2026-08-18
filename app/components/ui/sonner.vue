<script setup lang="ts">
import { Toaster, type ToasterProps } from 'vue-sonner'

const props = defineProps<ToasterProps>()
</script>

<template>
  <Toaster
    v-bind="props"
    theme="dark"
    position="top-center"
    :toast-options="{
      style: {
        background: 'linear-gradient(160deg, rgba(46,33,74,0.96), rgba(24,16,40,0.98))',
        border: '1px solid rgba(255,255,255,0.08)',
        color: '#f0e9f8',
        borderRadius: '1.25rem',
        boxShadow: '0 24px 60px -24px rgba(8,4,16,0.8)',
        backdropFilter: 'blur(18px)',
      },
    }"
    class="toaster group"
  />
</template>
