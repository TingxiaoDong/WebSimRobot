import { useCallback, useEffect, useState } from 'react'
import { Bot, Play, RefreshCw } from 'lucide-react'
import { Panel } from '@/components/console/Panel'
import { SimulationViewer } from '@/components/console/SimulationViewer'
import { Button } from '@/components/ui/button'

export default function Franka() {
  const [online, setOnline] = useState(false)
  const [message, setMessage] = useState('正在检查仿真连接…')
  const check = useCallback(async () => {
    try {
      const response = await fetch('/api/franka/status')
      if (!response.ok) throw new Error()
      setOnline(true)
      setMessage('仿真已连接，可以执行预设动作。')
    } catch {
      setOnline(false)
      setMessage('仿真未连接。请先启动 Franka 演示脚本。')
    }
  }, [])
  useEffect(() => {
    void check()
    const timer = window.setInterval(check, 3000)
    return () => window.clearInterval(timer)
  }, [check])
  async function wave() {
    try {
      const response = await fetch('/api/franka/wave', { method: 'POST' })
      if (!response.ok) throw new Error()
      setMessage('动作指令已发送：机械臂将左右摆动并回到初始位置。')
    } catch {
      setOnline(false)
      setMessage('发送失败，请检查 Franka 仿真进程。')
    }
  }
  return <div className="min-h-screen bg-[#0b0f14] text-slate-200">
    <header className="border-b border-slate-800 bg-[#0e1319] px-6 py-5"><div className="mx-auto flex max-w-[1600px] items-center gap-3"><Bot className="text-cyan-400" /><div><h1 className="font-bold">Franka 机械臂控制台</h1><p className="text-xs text-slate-500">Isaac Lab / Panda</p></div></div></header>
    <main className="mx-auto max-w-[1600px] space-y-4 px-4 py-5 sm:px-6 lg:px-8">
      <div role="status" className="rounded-md border border-slate-800 bg-slate-900/50 p-4 text-sm"><span className={online ? 'text-emerald-400' : 'text-amber-400'}>{online ? '● 已连接' : '● 未连接'}</span><span className="ml-3 text-slate-400">{message}</span></div>
      <SimulationViewer />
      <Panel title="预设动作" eyebrow="Franka demo" icon={<Bot />}>
        <p className="mb-4 text-sm leading-6 text-slate-400">点击后，机械臂的第一个关节左右摆动，随后回到初始姿态。请在 Isaac Sim 窗口或上方推流画面中观察。</p>
        <div className="flex flex-wrap gap-3"><Button disabled={!online} onClick={wave}><Play />执行摆动</Button><Button variant="outline" onClick={check} className="border-slate-700 bg-slate-800 text-slate-200"><RefreshCw />检查连接</Button></div>
      </Panel>
    </main>
  </div>
}
