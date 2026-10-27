import { useState, type FormEvent } from 'react'
import { ExternalLink, MonitorPlay, RefreshCw, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Panel } from '@/components/console/Panel'

function validUrl(value: string): string | null {
  try {
    const url = new URL(value)
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null
    return url.href
  } catch {
    return null
  }
}

export function SimulationViewer() {
  const [address, setAddress] = useState('')
  const [url, setUrl] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [version, setVersion] = useState(0)

  const open = (event: FormEvent) => {
    event.preventDefault()
    const next = validUrl(address.trim())
    if (!next) {
      setError('请输入完整的 HTTP 或 HTTPS 查看器地址。')
      return
    }
    if (window.location.protocol === 'https:' && new URL(next).protocol === 'http:') {
      setError('当前页面使用 HTTPS，请使用 HTTPS 查看器地址。')
      return
    }
    setError('')
    setUrl(next)
    setVersion((value) => value + 1)
  }

  return (
    <Panel title="仿真画面" eyebrow="Isaac Sim viewer" icon={<MonitorPlay />} bodyClassName="space-y-4">
      <form onSubmit={open} className="flex flex-col gap-2 sm:flex-row">
        <label htmlFor="viewer-address" className="sr-only">浏览器查看器地址</label>
        <input id="viewer-address" value={address} onChange={(event) => setAddress(event.target.value)}
          placeholder="http://仿真主机地址:8210" autoComplete="url" spellCheck={false}
          className="h-10 min-w-0 flex-1 rounded-md border border-slate-700 bg-slate-950/60 px-3 text-sm text-slate-200 outline-none placeholder:text-slate-600 focus:border-cyan-400" />
        <Button type="submit" className="h-10 bg-cyan-400 text-slate-950 hover:bg-cyan-300">打开画面</Button>
        {url && <Button type="button" variant="outline" className="h-10 border-slate-700 bg-slate-800 text-slate-200" onClick={() => { setUrl(null); setError('') }}><X />关闭</Button>}
      </form>
      {error && <p role="alert" className="text-xs text-red-300">{error}</p>}
      <div className="relative aspect-video overflow-hidden rounded-md border border-slate-800 bg-slate-950">
        {url ? (
          <iframe key={version} src={url} title="Isaac Sim 仿真浏览器查看器" allow="autoplay; fullscreen; clipboard-read; clipboard-write" allowFullScreen className="h-full w-full border-0" />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
            <MonitorPlay className="size-10 text-slate-700" />
            <p className="text-sm text-slate-300">等待仿真画面</p>
            <p className="max-w-md text-xs leading-5 text-slate-500">先启动 Isaac Sim 的 WebRTC 推流和浏览器查看器，再在上方输入查看器地址。</p>
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs leading-5 text-slate-500">
        <p>画面与 DDS 控制分别连接。若画面无法嵌入，可在新窗口打开；切换到画面时，键盘控制会停止。</p>
        {url && <div className="flex gap-3"><button type="button" onClick={() => setVersion((value) => value + 1)} className="flex items-center gap-1 text-cyan-400 hover:text-cyan-300"><RefreshCw className="size-3" />重新加载</button><a href={url} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-cyan-400 hover:text-cyan-300"><ExternalLink className="size-3" />新窗口打开</a></div>}
      </div>
    </Panel>
  )
}
