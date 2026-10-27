import { Check, CircleDashed, Minus, X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface StatusItemProps {
  label: string
  detail: string
  status: 'online' | 'offline' | 'idle' | 'warning'
}

export function StatusItem({ label, detail, status }: StatusItemProps) {
  const isOnline = status === 'online'
  const isWarning = status === 'warning'
  const Icon = isOnline ? Check : status === 'idle' ? Minus : status === 'offline' ? X : CircleDashed

  return (
    <div className="flex min-w-0 items-center gap-3 rounded-md border border-slate-800/80 bg-slate-950/45 px-3 py-2.5">
      <span
        className={cn(
          'flex size-7 shrink-0 items-center justify-center rounded border',
          isOnline && 'border-emerald-500/25 bg-emerald-500/10 text-emerald-400',
          status === 'offline' && 'border-slate-700 bg-slate-800/60 text-slate-500',
          status === 'idle' && 'border-slate-700 bg-slate-800/60 text-slate-500',
          isWarning && 'border-amber-500/25 bg-amber-500/10 text-amber-400',
        )}
      >
        <Icon className="size-3.5" strokeWidth={2.2} />
      </span>
      <div className="min-w-0">
        <p className="text-[11px] font-medium tracking-wide text-slate-500">{label}</p>
        <p
          className={cn(
            'truncate text-xs font-semibold',
            isOnline && 'text-emerald-300',
            isWarning && 'text-amber-300',
            (status === 'offline' || status === 'idle') && 'text-slate-400',
          )}
        >
          {detail}
        </p>
      </div>
    </div>
  )
}
