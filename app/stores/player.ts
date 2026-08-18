import { defineStore } from 'pinia'
import type { PlayerStatePayload, QueueItem, RepeatMode, Track } from '~/types/music'
import { mediaUrl, toQueueItem } from '~/types/music'
import { useAuthStore } from './auth'

const STORAGE_KEY = 'dreamy.player.v1'

const HISTORY_THRESHOLD = 20 // seconds of listening before recording history
const HISTORY_REPORT_EVERY = 10 // report at most every N listened seconds
const HISTORY_MIN_COMPLETED = 5 // minimum listened seconds for a 'completed' short track to count

interface PlaySession {
  trackId: string
  listened: number
  lastReported: number
}

export const usePlayerStore = defineStore('player', () => {
  // ---- state ----
  const queue = ref<QueueItem[]>([])
  const currentIndex = ref(-1)
  const position = ref(0)
  const duration = ref(0)
  const volume = ref(0.8)
  const muted = ref(false)
  const shuffle = ref(false)
  const repeatMode = ref<RepeatMode>('off')
  const isPlaying = ref(false)
  const isExpanded = ref(false)
  const audioError = ref<string | null>(null)
  const restoring = ref(true)

  // Play order of queue indices (shuffled or sequential).
  const order = ref<number[]>([])

  const current = computed<QueueItem | null>(() =>
    currentIndex.value >= 0 && currentIndex.value < queue.value.length
      ? queue.value[currentIndex.value] ?? null
      : null,
  )

  const auth = useAuthStore()

  // ---- audio element (client only) ----
  let el: HTMLAudioElement | null = null
  let session: PlaySession | null = null
  let lastTime = 0
  let suppressPersist = false
  let persistTimer: ReturnType<typeof setTimeout> | null = null

  function getEl(): HTMLAudioElement | null {
    if (import.meta.server) return null
    if (!el) {
      el = new Audio()
      el.preload = 'metadata'
      wireEvents(el)
    }
    return el
  }

  function wireEvents(audio: HTMLAudioElement): void {
    audio.addEventListener('timeupdate', () => {
      if (Number.isFinite(audio.currentTime)) position.value = audio.currentTime
      trackListening(audio)
    })
    audio.addEventListener('durationchange', () => {
      if (Number.isFinite(audio.duration) && audio.duration > 0) duration.value = audio.duration
    })
    audio.addEventListener('loadedmetadata', () => {
      if (Number.isFinite(audio.duration) && audio.duration > 0) duration.value = audio.duration
    })
    audio.addEventListener('ended', () => {
      isPlaying.value = false
      position.value = audio.duration || 0
      reportHistory(true)
      session = null
      next(true)
    })
    audio.addEventListener('error', () => {
      isPlaying.value = false
      audioError.value = 'This track could not be played.'
      session = null
    })
    audio.addEventListener('play', () => {
      isPlaying.value = true
      audioError.value = null
    })
    audio.addEventListener('pause', () => {
      isPlaying.value = false
    })
    audio.addEventListener('seeked', () => {
      lastTime = audio.currentTime
    })
  }

  function trackListening(audio: HTMLAudioElement): void {
    if (!session || !isPlaying.value || !auth.isSignedIn) return
    const delta = audio.currentTime - lastTime
    lastTime = audio.currentTime
    if (delta > 0 && delta < 5) {
      session.listened += delta
      if (session.listened >= HISTORY_THRESHOLD && session.listened - session.lastReported >= HISTORY_REPORT_EVERY) {
        // Report first, then mark the throttle point — otherwise the check
        // inside reportHistory() sees the fresh value and always bails.
        reportHistory()
        session.lastReported = session.listened
      }
    }
  }

  /**
   * Make sure a play session exists for the current track. Playback can be
   * resumed without loadTrack() (restored state, toggling an already-loaded
   * track), and without a session none of that listening is ever recorded.
   */
  function ensureSession(): void {
    const item = current.value
    if (!item) return
    if (session && session.trackId === item.id) return
    if (session) {
      reportHistory(true)
      session = null
    }
    session = { trackId: item.id, listened: 0, lastReported: 0 }
    lastTime = getEl()?.currentTime ?? 0
  }

  function reportHistory(force = false): void {
    if (!session || !auth.isSignedIn) return
    const completed = force && (position.value >= (duration.value - 3))
    // Fully-listened short tracks still count; otherwise require a real moment.
    if (session.listened < HISTORY_THRESHOLD && !(completed && session.listened >= HISTORY_MIN_COMPLETED)) return
    if (!force && session.listened - session.lastReported < HISTORY_REPORT_EVERY) return
    const payload = {
      trackId: session.trackId,
      listenedSeconds: Math.floor(session.listened),
      completed,
    }
    $fetch('/api/history', { method: 'POST', body: payload }).catch(() => {})
  }

  function flushSession(): void {
    if (session) {
      reportHistory(true)
      session = null
    }
  }

  // ---- loading & playback ----
  function loadTrack(item: QueueItem, autoplay: boolean): void {
    const audio = getEl()
    flushSession()
    session = { trackId: item.id, listened: 0, lastReported: 0 }
    lastTime = 0
    audioError.value = null
    position.value = 0
    duration.value = item.duration || 0
    if (!audio) return
    audio.src = mediaUrl(item.audioKey)
    audio.volume = muted.value ? 0 : volume.value
    if (autoplay) {
      audio.play().catch(() => {
        // Autoplay may be blocked; user can press play.
        isPlaying.value = false
      })
    }
  }

  function playTrackList(tracks: Track[], index = 0): void {
    if (tracks.length === 0) return
    queue.value = tracks.map(toQueueItem)
    currentIndex.value = Math.min(Math.max(index, 0), tracks.length - 1)
    rebuildOrder()
    const item = current.value
    if (item) loadTrack(item, true)
  }

  function playQueue(items: QueueItem[], index = 0): void {
    if (items.length === 0) return
    queue.value = items
    currentIndex.value = Math.min(Math.max(index, 0), items.length - 1)
    rebuildOrder()
    const item = current.value
    if (item) loadTrack(item, true)
  }

  function playTrack(track: Track): void {
    const existing = queue.value.findIndex((q) => q.id === track.id)
    if (existing >= 0) {
      if (existing === currentIndex.value) {
        toggle()
      } else {
        currentIndex.value = existing
        const item = current.value
        if (item) loadTrack(item, true)
      }
    } else {
      playTrackList([track], 0)
    }
  }

  /**
   * Play a track inside its surrounding list, building the queue from that
   * list so previous/next move through the visible collection instead of a
   * single-track queue (which made “next” restart the same song).
   */
  function playInList(track: Track, list: Track[]): void {
    if (list.length === 0) return
    if (current.value?.id === track.id) {
      toggle()
      return
    }
    const index = list.findIndex((t) => t.id === track.id)
    playTrackList(list, index < 0 ? 0 : index)
  }

  function toggle(): void {
    const audio = getEl()
    const item = current.value
    if (!audio || !item) return
    if (isPlaying.value) {
      audio.pause()
      // Pausing is a natural moment to flush listening progress so far.
      reportHistory(true)
    } else {
      if (audioError.value || !audio.src) loadTrack(item, true)
      else {
        ensureSession()
        audio.play().catch(() => {})
      }
    }
  }

  function play(): void {
    const audio = getEl()
    if (!audio || !current.value) return
    ensureSession()
    audio.play().catch(() => {})
  }

  function pause(): void {
    const audio = getEl()
    if (audio) audio.pause()
    reportHistory(true)
  }

  function seek(seconds: number): void {
    const audio = getEl()
    if (!audio) return
    if (!Number.isFinite(seconds)) return
    const max = audio.duration || duration.value || 0
    const target = Number.isFinite(max) ? Math.min(Math.max(seconds, 0), max) : Math.max(seconds, 0)
    audio.currentTime = target
    position.value = target
  }

  function next(auto = false): void {
    if (queue.value.length === 0) return
    if (repeatMode.value === 'track' && current.value) {
      const audio = getEl()
      if (audio) {
        audio.currentTime = 0
        audio.play().catch(() => {})
      }
      return
    }
    const orderIdx = order.value.indexOf(currentIndex.value)
    let nextOrderIdx = orderIdx + 1
    if (nextOrderIdx >= order.value.length) {
      if (auto && repeatMode.value !== 'queue') {
        // Reached the end — rest at the last track.
        const audio = getEl()
        if (audio) audio.pause()
        position.value = duration.value
        return
      }
      nextOrderIdx = 0
    }
    const nextIndex = order.value[nextOrderIdx]
    if (nextIndex === undefined) return
    currentIndex.value = nextIndex
    const item = current.value
    if (item) loadTrack(item, true)
  }

  function prev(): void {
    if (queue.value.length === 0) return
    const audio = getEl()
    if (audio && audio.currentTime > 4) {
      audio.currentTime = 0
      position.value = 0
      return
    }
    const orderIdx = order.value.indexOf(currentIndex.value)
    let prevOrderIdx = orderIdx - 1
    if (prevOrderIdx < 0) {
      if (repeatMode.value !== 'queue') {
        const el2 = getEl()
        if (el2) el2.currentTime = 0
        return
      }
      prevOrderIdx = order.value.length - 1
    }
    const prevIndex = order.value[prevOrderIdx]
    if (prevIndex === undefined) return
    currentIndex.value = prevIndex
    const item = current.value
    if (item) loadTrack(item, true)
  }

  // ---- queue management ----
  function rebuildOrder(): void {
    const n = queue.value.length
    if (n === 0) {
      order.value = []
      return
    }
    const indices = Array.from({ length: n }, (_, i) => i)
    if (!shuffle.value) {
      order.value = indices
      return
    }
    const currentIdx = currentIndex.value >= 0 && currentIndex.value < n ? currentIndex.value : 0
    const rest = indices.filter((i) => i !== currentIdx)
    for (let i = rest.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      const tmp = rest[i]!
      rest[i] = rest[j]!
      rest[j] = tmp
    }
    order.value = [currentIdx, ...rest]
  }

  function addToQueue(track: Track): void {
    if (queue.value.length === 0) {
      playTrack(track)
      return
    }
    queue.value.push(toQueueItem(track))
    if (shuffle.value) rebuildOrder()
  }

  function playNext(track: Track): void {
    if (queue.value.length === 0) {
      playTrack(track)
      return
    }
    const insertAt = currentIndex.value + 1
    queue.value.splice(insertAt, 0, toQueueItem(track))
    if (currentIndex.value >= insertAt) currentIndex.value++
    if (shuffle.value) rebuildOrder()
  }

  function removeFromQueue(index: number): void {
    if (index < 0 || index >= queue.value.length) return
    const wasCurrent = index === currentIndex.value
    queue.value.splice(index, 1)
    if (queue.value.length === 0) {
      currentIndex.value = -1
      const audio = getEl()
      if (audio) {
        audio.pause()
        audio.removeAttribute('src')
      }
      order.value = []
      return
    }
    if (index < currentIndex.value) currentIndex.value--
    else if (wasCurrent) {
      currentIndex.value = Math.min(currentIndex.value, queue.value.length - 1)
      const item = current.value
      if (item) loadTrack(item, true)
    }
    if (shuffle.value) rebuildOrder()
  }

  function reorderQueue(from: number, to: number): void {
    if (from < 0 || from >= queue.value.length || to < 0 || to >= queue.value.length) return
    const [moved] = queue.value.splice(from, 1)
    queue.value.splice(to, 0, moved!)
    if (from === currentIndex.value) currentIndex.value = to
    else if (from < currentIndex.value && to >= currentIndex.value) currentIndex.value--
    else if (from > currentIndex.value && to <= currentIndex.value) currentIndex.value++
    if (shuffle.value) rebuildOrder()
  }

  function clearQueue(): void {
    const audio = getEl()
    if (audio) {
      audio.pause()
      audio.removeAttribute('src')
    }
    flushSession()
    queue.value = []
    currentIndex.value = -1
    position.value = 0
    duration.value = 0
    order.value = []
  }

  // ---- settings ----
  function setVolume(v: number): void {
    volume.value = Math.min(Math.max(v, 0), 1)
    if (v > 0) muted.value = false
    const audio = getEl()
    if (audio) audio.volume = muted.value ? 0 : volume.value
  }

  function toggleMute(): void {
    muted.value = !muted.value
    const audio = getEl()
    if (audio) audio.volume = muted.value ? 0 : volume.value
  }

  function toggleShuffle(): void {
    shuffle.value = !shuffle.value
    rebuildOrder()
  }

  function cycleRepeat(): RepeatMode {
    repeatMode.value = repeatMode.value === 'off' ? 'queue' : repeatMode.value === 'queue' ? 'track' : 'off'
    return repeatMode.value
  }

  // ---- expanded player ----
  function openExpanded(): void {
    isExpanded.value = true
  }
  function closeExpanded(): void {
    isExpanded.value = false
  }

  // ---- persistence ----
  function toPayload(): PlayerStatePayload {
    return {
      queue: queue.value,
      currentIndex: currentIndex.value,
      position: Math.floor(position.value),
      volume: volume.value,
      muted: muted.value,
      shuffle: shuffle.value,
      repeatMode: repeatMode.value,
    }
  }

  function applyPayload(payload: PlayerStatePayload): void {
    suppressPersist = true
    queue.value = Array.isArray(payload.queue) ? payload.queue : []
    currentIndex.value = payload.currentIndex ?? -1
    position.value = payload.position ?? 0
    volume.value = payload.volume ?? 0.8
    muted.value = payload.muted ?? false
    shuffle.value = payload.shuffle ?? false
    repeatMode.value = (payload.repeatMode as RepeatMode) || 'off'
    rebuildOrder()
    suppressPersist = false
  }

  function schedulePersist(): void {
    if (suppressPersist || restoring.value) return
    if (persistTimer) clearTimeout(persistTimer)
    persistTimer = setTimeout(() => persistNow(), 800)
  }

  async function persistNow(): Promise<void> {
    if (suppressPersist || restoring.value) return
    const payload = toPayload()
    // Only signed-in users have a player; don't leave a queue in local
    // storage that could leak across accounts or show an unplayable bar.
    if (auth.isSignedIn) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
      } catch {
        // storage may be unavailable; ignore
      }
      try {
        await $fetch('/api/player', { method: 'PUT', body: payload })
      } catch {
        // offline / server error — local cache still has it
      }
    }
  }

  /** Restore from local cache immediately, then server state for signed-in users. */
  async function restore(): Promise<void> {
    restoring.value = true
    try {
      // Guests cannot stream media, so they get no player at all — not even
      // a restored queue from a previous session.
      if (!auth.isSignedIn) return
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) {
        try {
          const parsed = JSON.parse(raw) as PlayerStatePayload
          if (parsed && Array.isArray(parsed.queue) && parsed.queue.length > 0) {
            applyPayload(parsed)
            if (parsed.currentIndex >= 0 && parsed.currentIndex < parsed.queue.length) {
              const item = parsed.queue[parsed.currentIndex]
              if (item) {
                // Load audio so the player is ready; do not autoplay on restore.
                const audio = getEl()
                if (audio) {
                  audio.src = mediaUrl(item.audioKey)
                  audio.volume = parsed.muted ? 0 : parsed.volume
                  duration.value = item.duration || 0
                  if (parsed.position) audio.currentTime = Math.min(parsed.position, item.duration || 0)
                  position.value = parsed.position ?? 0
                }
              }
            }
          }
        } catch {
          localStorage.removeItem(STORAGE_KEY)
        }
      }

      if (auth.isSignedIn) {
        try {
          const res = await $fetch<{ state: PlayerStatePayload | null }>('/api/player')
          if (res.state && res.state.queue && res.state.queue.length > 0) {
            applyPayload(res.state)
            const item = res.state.queue[res.state.currentIndex]
            if (item) {
              const audio = getEl()
              if (audio) {
                audio.src = mediaUrl(item.audioKey)
                audio.volume = res.state.muted ? 0 : res.state.volume
                duration.value = item.duration || 0
                position.value = res.state.position ?? 0
              }
            }
          }
        } catch {
          // fall back to local cache
        }
      }
    } finally {
      restoring.value = false
    }
  }

  watch([queue, currentIndex, position, volume, muted, shuffle, repeatMode], () => {
    schedulePersist()
  })

  function getAudioElement(): HTMLAudioElement | null {
    return getEl()
  }

  /** Wipe the player (queue, audio, cache) — used on sign-out. */
  function reset(): void {
    if (el) {
      el.pause()
      el.removeAttribute('src')
      el.load()
    }
    session = null
    suppressPersist = true
    queue.value = []
    currentIndex.value = -1
    position.value = 0
    duration.value = 0
    volume.value = 0.8
    muted.value = false
    shuffle.value = false
    repeatMode.value = 'off'
    isPlaying.value = false
    isExpanded.value = false
    audioError.value = null
    suppressPersist = false
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch {
      // storage may be unavailable; ignore
    }
  }

  return {
    queue,
    currentIndex,
    position,
    duration,
    volume,
    muted,
    shuffle,
    repeatMode,
    isPlaying,
    isExpanded,
    audioError,
    restoring,
    order,
    current,
    getAudioElement,
    reset,
    loadTrack,
    playTrackList,
    playQueue,
    playTrack,
    playInList,
    toggle,
    play,
    pause,
    seek,
    next,
    prev,
    addToQueue,
    playNext,
    removeFromQueue,
    reorderQueue,
    clearQueue,
    setVolume,
    toggleMute,
    toggleShuffle,
    cycleRepeat,
    openExpanded,
    closeExpanded,
    restore,
    persistNow,
  }
})
