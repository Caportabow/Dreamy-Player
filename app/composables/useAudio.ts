import { usePlayerStore } from '~/stores/player'

/**
 * Composable over the shared HTMLAudioElement owned by the player store.
 * Components use it for raw element access (seeking, volume) and controls.
 */
export function useAudio() {
  const player = usePlayerStore()

  return {
    player,
    element: player.getAudioElement,
    play: player.play,
    pause: player.pause,
    toggle: player.toggle,
    seek: player.seek,
    setVolume: player.setVolume,
  }
}
