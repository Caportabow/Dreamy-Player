<script setup lang="ts">
withDefaults(defineProps<{ size?: number | string; class?: string }>(), { size: 40 })

// Unique per instance: two logos on the same page (sidebar + header) previously
// shared hard-coded gradient ids, so the second instance referenced a gradient
// inside the hidden sidebar and painted nothing.
const uid = useId()
</script>

<template>
  <svg
    :width="size"
    :height="size"
    viewBox="0 0 48 48"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    :class="class"
    role="img"
    aria-label="Dreamy"
  >
    <defs>
      <linearGradient
        :id="`moonGrad-${uid}`"
        x1="10"
        y1="4"
        x2="40"
        y2="44"
        gradientUnits="userSpaceOnUse"
      >
        <stop offset="0" stop-color="#d5c7f2" />
        <stop offset="0.55" stop-color="#b6a2db" />
        <stop offset="1" stop-color="#9278bd" />
      </linearGradient>
      <linearGradient
        :id="`moonGlow-${uid}`"
        x1="12"
        y1="8"
        x2="36"
        y2="40"
        gradientUnits="userSpaceOnUse"
      >
        <stop offset="0" stop-color="#8f77bd" stop-opacity="0.5" />
        <stop offset="1" stop-color="#8f77bd" stop-opacity="0" />
      </linearGradient>
    </defs>

    <!-- diffuse glow -->
    <circle cx="24" cy="24" r="21" :fill="`url(#moonGlow-${uid})`" />

    <!-- crescent: outer circle minus offset inner circle -->
    <path
      d="M 24 4 A 20 20 0 1 0 24 44 A 20 20 0 1 0 24 4 Z M 31 10.5 A 13.5 13.5 0 1 1 31 37.5 A 13.5 13.5 0 1 1 31 10.5 Z"
      :fill="`url(#moonGrad-${uid})`"
      fill-rule="evenodd"
    />

    <!-- music note cradled in the crescent's opening -->
    <g transform="translate(2, 0)">
      <circle cx="36.5" cy="30.5" r="3.6" fill="#241a3a" />
      <path d="M 40 30.5 V 17.2" stroke="#241a3a" stroke-width="2.1" stroke-linecap="round" />
      <path
        d="M 40 17.2 C 43.6 18.4 44.8 20.8 44.2 23.4 C 43.9 22.1 42.9 21 41.2 20.5 L 40 20.2 Z"
        fill="#241a3a"
      />
    </g>
  </svg>
</template>
