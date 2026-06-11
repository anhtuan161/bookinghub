import { useEffect, useState } from 'react'
import { subscribeToast } from '../lib/toast'

interface Item {
  id: number
  msg: string
}

let nextId = 1

export default function Toaster() {
  const [items, setItems] = useState<Item[]>([])

  useEffect(() => {
    return subscribeToast((msg) => {
      const id = nextId++
      setItems((prev) => [...prev, { id, msg }])
      setTimeout(() => setItems((prev) => prev.filter((i) => i.id !== id)), 2500)
    })
  }, [])

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      {items.map((i) => (
        <div
          key={i.id}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm text-white shadow-lg"
        >
          {i.msg}
        </div>
      ))}
    </div>
  )
}
