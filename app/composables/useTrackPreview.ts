import { ref } from 'vue'

/**
 * Shared playback of the short Apple iTunes previews offered on search
 * results. Only one preview plays at a time, anywhere in the app; starting a
 * new one (or leaving the page) stops the previous one.
 */

const playingUrl = ref<string | null>(null)
let audio: HTMLAudioElement | null = null

export function useTrackPreview(): {
  playingUrl: Readonly<typeof playingUrl>
  togglePreview: (url: string) => Promise<void>
  stopPreview: () => void
} {
  async function togglePreview(url: string): Promise<void> {
    if (!url) return
    // Same preview again → stop it.
    if (playingUrl.value === url && audio) {
      stopPreview()
      return
    }

    stopPreview()
    playingUrl.value = url

    const el = new Audio(url)
    el.preload = 'none'
    el.addEventListener('ended', () => {
      if (playingUrl.value === url) playingUrl.value = null
    })
    el.addEventListener('error', () => {
      if (playingUrl.value === url) playingUrl.value = null
    })
    audio = el
    try {
      await el.play()
    } catch {
      stopPreview()
    }
  }

  function stopPreview(): void {
    if (audio) {
      audio.pause()
      audio.src = ''
      audio = null
    }
    playingUrl.value = null
  }

  return { playingUrl, togglePreview, stopPreview }
}
