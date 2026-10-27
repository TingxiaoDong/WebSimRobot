import { useState } from 'react'
import Home from './pages/Home'
import Franka from './pages/Franka'

export default function App() {
  const [page, setPage] = useState<'unitree' | 'franka'>('unitree')
  return <>
    <nav aria-label="机器人切换" className="flex gap-2 border-b border-slate-800 bg-[#0b0f14] px-4 py-2 sm:px-6">
      {(['unitree', 'franka'] as const).map(item => <button key={item} type="button" onClick={() => setPage(item)} aria-current={page === item ? 'page' : undefined} className={`rounded px-3 py-1.5 text-xs font-semibold ${page === item ? 'bg-cyan-400 text-slate-950' : 'text-slate-400 hover:bg-slate-800'}`}>{item === 'unitree' ? 'Unitree 控制' : 'Franka 机械臂'}</button>)}
    </nav>
    {page === 'unitree' ? <Home /> : <Franka />}
  </>
}
