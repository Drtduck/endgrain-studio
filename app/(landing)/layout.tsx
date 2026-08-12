import type { ReactNode } from 'react'

export default function LandingLayout({ children }: { children: ReactNode }) {
  return <div className="flex min-h-screen flex-col bg-app">{children}</div>
}
