import type { ReactNode } from 'react'

export default function AuthShell({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-100 via-slate-100 to-brand-50 p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 text-3xl shadow-pop">
            🏡
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-800">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
        </div>
        {children}
      </div>
    </div>
  )
}

export function FormError({ msg }: { msg?: string }) {
  if (!msg) return null
  return <div className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{msg}</div>
}
