export const DB_REFRESH_EVENT = 'villaos:db-refresh'

export function notifyDbRefresh() {
  window.dispatchEvent(new Event(DB_REFRESH_EVENT))
}

export function onDbRefresh(handler: () => void) {
  window.addEventListener(DB_REFRESH_EVENT, handler)
  return () => window.removeEventListener(DB_REFRESH_EVENT, handler)
}
