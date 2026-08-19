/**
 * Desktop nicety: pressing "/" jumps into the page's search box (like
 * GitHub, Notion, Slack…). Never hijacks the key while typing or inside
 * a dialog/menu. Call once per page that has a search field.
 */
export function useSlashFocus(getTarget: () => HTMLElement | null): void {
  function onKeydown(e: KeyboardEvent): void {
    const target = e.target
    if (target instanceof Element && target.closest('input, textarea, select, [contenteditable], [role="dialog"], [role="menu"]')) return
    if (e.metaKey || e.ctrlKey || e.altKey) return
    if (e.key !== '/') return
    e.preventDefault()
    getTarget()?.focus()
  }

  onMounted(() => window.addEventListener('keydown', onKeydown))
  onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
}
