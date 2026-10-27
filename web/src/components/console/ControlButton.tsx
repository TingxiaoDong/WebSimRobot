import type { PointerEvent, ReactNode } from 'react'
import { cn } from '@/lib/utils'
import type { ControlAction } from '@/types/robot'

interface ControlButtonProps {
  action: ControlAction
  label: string
  keyLabel: string
  icon: ReactNode
  active: boolean
  disabled: boolean
  onPress: (action: ControlAction) => void
  onRelease: (action: ControlAction) => void
  onCancel: () => void
  className?: string
}

export function ControlButton({
  action,
  label,
  keyLabel,
  icon,
  active,
  disabled,
  onPress,
  onRelease,
  onCancel,
  className,
}: ControlButtonProps) {
  const start = (event: PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0 || disabled) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    onPress(action)
  }

  const end = (event: PointerEvent<HTMLButtonElement>) => {
    event.preventDefault()
    onRelease(action)
  }

  return (
    <button
      type="button"
      aria-label={`${label}，按住 ${keyLabel} 键`}
      aria-pressed={active}
      disabled={disabled}
      onPointerDown={start}
      onPointerUp={end}
      onPointerCancel={onCancel}
      onLostPointerCapture={() => onRelease(action)}
      onContextMenu={(event) => event.preventDefault()}
      className={cn(
        'group relative flex min-h-[72px] touch-none select-none flex-col items-center justify-center gap-1.5 rounded-md border border-slate-700/90 bg-slate-800/55 text-slate-300 shadow-[inset_0_1px_0_rgba(255,255,255,0.025)] outline-none transition-colors duration-100',
        'hover:border-slate-600 hover:bg-slate-800 hover:text-white focus-visible:ring-2 focus-visible:ring-cyan-400/60',
        'active:border-cyan-400/50 active:bg-cyan-400/10 active:text-cyan-300 disabled:cursor-not-allowed disabled:border-slate-800 disabled:bg-slate-900/40 disabled:text-slate-700',
        active && 'border-cyan-400/60 bg-cyan-400/10 text-cyan-300 shadow-[inset_0_0_0_1px_rgba(34,211,238,0.08)]',
        className,
      )}
    >
      <span className="[&_svg]:size-5">{icon}</span>
      <span className="text-[11px] font-medium">{label}</span>
      <kbd className="absolute right-1.5 top-1.5 rounded border border-current/20 px-1 font-mono text-[9px] leading-4 opacity-50">
        {keyLabel}
      </kbd>
    </button>
  )
}
