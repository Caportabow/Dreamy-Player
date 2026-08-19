import { Heart, Library, ListMusic, Plus, UserRound } from 'lucide-vue-next'
import type { Component } from 'vue'

export interface NavItem {
  label: string
  to: string
  icon: Component
}

/**
 * Single source of truth for primary navigation — the desktop sidebar and
 * the mobile bottom bar both render these, so the two can never drift.
 */
export const mainNavItems: NavItem[] = [
  { label: 'Library', to: '/', icon: Library },
  { label: 'Add song', to: '/add', icon: Plus },
  { label: 'Favourites', to: '/favourites', icon: Heart },
  { label: 'Playlists', to: '/playlists', icon: ListMusic },
  { label: 'Profile', to: '/profile', icon: UserRound },
]

/** Exact match for the home route, prefix match for everything else. */
export function isMainNavActive(path: string, to: string): boolean {
  if (to === '/') return path === '/'
  return path === to || path.startsWith(`${to}/`)
}
