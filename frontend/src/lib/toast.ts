type Listener = (msg: string) => void

let listeners: Listener[] = []

export function showToast(msg: string) {
  listeners.forEach((l) => l(msg))
}

export function subscribeToast(l: Listener): () => void {
  listeners.push(l)
  return () => {
    listeners = listeners.filter((x) => x !== l)
  }
}
