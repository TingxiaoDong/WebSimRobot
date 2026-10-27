import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface PanelProps {
  title: string
  eyebrow?: string
  icon?: ReactNode
  action?: ReactNode
  children: ReactNode
  className?: string
  bodyClassName?: string
}

export function Panel({ title, eyebrow, icon, action, children, className, bodyClassName }: PanelProps) {
  return (
    <section className={cn('overflow-hidden rounded-lg border border-slate-800 bg-[#11161d] shadow-[0_8px_30px_rgba(0,0,0,0.12)]', className)}>
      <header className="flex min-h-14 items-center justify-between gap-3 border-b border-slate-800/90 px-4 py-3 sm:px-5">
        <div className="flex min-w-0 items-center gap-3">
          {icon && <span className="text-slate-500 [&_svg]:size-4">{icon}</span>}
          <div className="min-w-0">
            {eyebrow && <p className="mb-0.5 text-[9px] font-semibold uppercase tracking-[0.2em] text-slate-600">{eyebrow}</p>}
            <h2 className="truncate text-sm font-semibold tracking-wide text-slate-200">{title}</h2>
          </div>
        </div>
        {action}
      </header>
      <div className={cn('p-4 sm:p-5', bodyClassName)}>{children}</div>
    </section>
  )
}
