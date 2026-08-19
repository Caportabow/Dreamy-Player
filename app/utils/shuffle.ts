/**
 * Unbiased Fisher–Yates shuffle. Replaces the biased
 * `sort(() => Math.random() - 0.5)` pattern so every permutation is equally
 * likely.
 */
export function shuffleArray<T>(list: readonly T[]): T[] {
  const arr = [...list]
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const tmp = arr[i]!
    arr[i] = arr[j]!
    arr[j] = tmp
  }
  return arr
}

/**
 * A shuffle that keeps the active sort direction meaningful: the (already
 * sorted) list is split in half and the two halves are interleaved, so
 * consecutive tracks come from opposite ends of the sort axis (newer ↔
 * older, A ↔ Z) instead of random clumps. A random rotation and a random
 * lead keep repeated presses feeling fresh rather than a fixed pattern.
 */
export function smartShuffle<T>(list: readonly T[]): T[] {
  const n = list.length
  if (n <= 2) return shuffleArray(list)

  const rotated = [...list]
  const shift = Math.floor(Math.random() * n)
  rotated.push(...rotated.splice(0, shift))

  const half = Math.ceil(n / 2)
  const first = rotated.slice(0, half)
  const second = rotated.slice(half)
  const lead = Math.random() < 0.5
  const result: T[] = []
  const max = Math.max(first.length, second.length)
  for (let i = 0; i < max; i++) {
    const a = lead ? first[i] : second[i]
    const b = lead ? second[i] : first[i]
    if (a !== undefined) result.push(a)
    if (b !== undefined) result.push(b)
  }
  return result
}
