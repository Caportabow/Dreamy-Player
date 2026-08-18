<script setup lang="ts">
const props = defineProps<{ data: { date: string; seconds: number }[] }>()

const W = 720
const H = 200
const PAD = 8

const maxValue = computed(() => Math.max(...props.data.map((d) => d.seconds), 60))

const points = computed(() => {
  const n = props.data.length
  return props.data.map((d, i) => {
    const x = PAD + (i / Math.max(n - 1, 1)) * (W - PAD * 2)
    const y = H - PAD - (d.seconds / maxValue.value) * (H - PAD * 2)
    return { x, y, ...d }
  })
})

const linePath = computed(() => {
  if (points.value.length === 0) return ''
  return points.value
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(' ')
})

const areaPath = computed(() => {
  if (points.value.length === 0) return ''
  const first = points.value[0]!
  const last = points.value[points.value.length - 1]!
  return `${linePath.value} L ${last.x.toFixed(1)} ${H - PAD} L ${first.x.toFixed(1)} ${H - PAD} Z`
})

const ticks = computed(() => {
  const n = props.data.length
  const idxs = [0, Math.floor(n / 4), Math.floor(n / 2), Math.floor((3 * n) / 4), n - 1]
  return [...new Set(idxs)].map((i) => {
    const d = props.data[i]
    if (!d) return null
    const date = new Date(`${d.date}T00:00:00`)
    return {
      label: date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
      x: points.value[i]?.x ?? 0,
    }
  })
})
</script>

<template>
  <div class="w-full">
    <svg :viewBox="`0 0 ${W} ${H}`" class="h-44 w-full sm:h-52" preserveAspectRatio="none" role="img" aria-label="Listening activity over the last 30 days">
      <defs>
        <linearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#a391d8" stop-opacity="0.5" />
          <stop offset="1" stop-color="#a391d8" stop-opacity="0.02" />
        </linearGradient>
        <linearGradient id="lineStroke" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stop-color="#c9b8ea" />
          <stop offset="1" stop-color="#8f79c0" />
        </linearGradient>
      </defs>

      <path :d="areaPath" fill="url(#areaFill)" />
      <path
        :d="linePath"
        fill="none"
        stroke="url(#lineStroke)"
        stroke-width="2.5"
        stroke-linecap="round"
        stroke-linejoin="round"
        vector-effect="non-scaling-stroke"
      />
      <circle
        v-for="p in points"
        :key="p.date"
        :cx="p.x"
        :cy="p.y"
        r="2.5"
        fill="#e6dcf4"
        opacity="0.55"
      />
    </svg>

    <div class="mt-1 flex justify-between px-1 text-[10px] text-cream-faint">
      <span v-for="t in ticks" :key="t?.label">{{ t?.label }}</span>
    </div>
  </div>
</template>
