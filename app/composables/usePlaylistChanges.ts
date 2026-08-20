/**
 * Module-scope reactive counter bumped whenever a playlist is created, edited,
 * or deleted anywhere in the app. The sidebar watches it to keep its list
 * fresh even when the change happens without a route change — e.g. renaming a
 * playlist while staying on its page, or adding a track from another page.
 */
const playlistChanges = ref(0)

export function usePlaylistChanges() {
  function bump(): void {
    playlistChanges.value++
  }
  return { playlistChanges, bump }
}
