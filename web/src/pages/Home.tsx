import {
  Activity,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Bot,
  Box,
  ChevronsDown,
  CircleAlert,
  Clock3,
  Cpu,
  Eraser,
  Gamepad2,
  Gauge,
  Grip,
  Hand,
  Keyboard,
  Link2,
  LoaderCircle,
  Move,
  Octagon,
  Radio,
  RefreshCcw,
  RotateCcw,
  RotateCw,
  Server,
  ShieldAlert,
  TerminalSquare,
  Unlink,
  Wifi,
  X,
} from 'lucide-react'
import { ControlButton } from '@/components/console/ControlButton'
import { Panel } from '@/components/console/Panel'
import { StatusItem } from '@/components/console/StatusItem'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Slider } from '@/components/ui/slider'
import { useRobotController } from '@/hooks/useRobotController'
import { cn } from '@/lib/utils'
import type { ControlAction, LogLevel } from '@/types/robot'

const channelLabels = {
  connecting: '正在连接',
  websocket: 'WebSocket 实时',
  polling: '1 秒轮询降级',
  offline: '通道已断开',
}

const logStyles: Record<LogLevel, string> = {
  info: 'text-slate-400',
  success: 'text-emerald-400',
  warning: 'text-amber-400',
  error: 'text-red-400',
}

function formatTime(value: string | null) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('zh-CN', { hour12: false })
}

export default function Home() {
  const controller = useRobotController()
  const {
    state,
    busy,
    stopping,
    canControl,
    activeActions,
    currentCommand,
    visibleError,
    logs,
  } = controller
  const isBusy = busy !== null

  const controlHint = !state.connected
    ? '请先建立仿真连接'
    : !controller.sessionReady
      ? '控制会话尚未建立'
      : !state.controllable
        ? '后端当前不允许运动控制'
        : !state.wholebody
          ? '当前机器人未启用全身控制'
          : '按住控制，松开立即停止'

  const controlProps = (action: ControlAction) => ({
    action,
    active: activeActions.includes(action),
    disabled: !canControl || isBusy,
    onPress: controller.press,
    onRelease: controller.release,
    onCancel: controller.stop,
  })

  return (
    <div className="min-h-screen bg-[#0b0f14] text-slate-200">
      <header className="border-b border-slate-800 bg-[#0e1319]">
        <div className="mx-auto flex min-h-[72px] max-w-[1600px] items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-md border border-cyan-400/25 bg-cyan-400/[0.07] text-cyan-400">
              <Bot className="size-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2.5">
                <h1 className="truncate text-sm font-bold tracking-[0.08em] text-slate-100 sm:text-base">
                  机器人仿真控制台
                </h1>
                <span className="hidden rounded border border-slate-700 px-1.5 py-0.5 font-mono text-[9px] tracking-widest text-slate-500 md:inline">
                  UNITREE
                </span>
              </div>
              <p className="mt-1 truncate font-mono text-[9px] uppercase tracking-[0.18em] text-slate-600 sm:text-[10px]">
                Simulation operations / Isaac Lab
              </p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            <div className="hidden items-center gap-2 rounded-md border border-slate-800 bg-slate-950/50 px-3 py-2 sm:flex">
              <span className={cn('size-1.5 rounded-full', controller.backendOnline ? 'bg-emerald-400' : 'bg-slate-600')} />
              <span className="font-mono text-[10px] tracking-wider text-slate-400">
                {state.mode.toUpperCase()}
              </span>
            </div>
            <Button
              type="button"
              disabled={isBusy}
              onClick={state.connected ? controller.disconnect : controller.connect}
              className={cn(
                'h-10 rounded-md px-3 text-xs font-semibold sm:px-4',
                state.connected
                  ? 'border border-slate-700 bg-slate-800/70 text-slate-200 hover:bg-slate-800'
                  : 'bg-cyan-400 text-slate-950 hover:bg-cyan-300',
              )}
            >
              {busy === 'connect' || busy === 'disconnect' ? (
                <LoaderCircle className="animate-spin" />
              ) : state.connected ? (
                <Unlink />
              ) : (
                <Link2 />
              )}
              <span>{state.connected ? '断开连接' : '连接仿真'}</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1600px] space-y-4 px-4 py-4 sm:px-6 sm:py-5 lg:px-8">
        <div className="flex flex-col gap-2 rounded-md border border-amber-500/20 bg-amber-500/[0.045] px-3.5 py-3 text-xs sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-2.5 text-amber-200/90">
            <CircleAlert className="mt-0.5 size-4 shrink-0 text-amber-400" />
            <span>
              {state.mode === 'mock'
                ? '当前为 Mock 模式，未连接真实仿真；界面数据仅用于联调。'
                : '当前为 MCP 模式，控制指令将通过远程 MCP 服务转发。'}
            </span>
          </div>
          <div className="flex items-center gap-2 pl-[26px] text-red-300/85 sm:pl-0">
            <ShieldAlert className="size-3.5 shrink-0" />
            <span>软件停止不等于硬件急停</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-5">
          <StatusItem
            label="后端服务"
            detail={controller.backendOnline ? 'API 服务在线' : '服务不可用'}
            status={controller.backendOnline ? 'online' : 'offline'}
          />
          <StatusItem
            label="MCP 链路"
            detail={state.mode === 'mock' ? 'Mock 模式未启用' : state.mcp_connected ? 'MCP 已连接' : 'MCP 未连接'}
            status={state.mode === 'mock' ? 'idle' : state.mcp_connected ? 'online' : 'offline'}
          />
          <StatusItem
            label="仿真环境"
            detail={state.simulation_connected ? '仿真已连接' : state.connected ? '仿真未就绪' : '等待连接'}
            status={state.simulation_connected ? 'online' : state.connected ? 'warning' : 'idle'}
          />
          <StatusItem
            label="控制会话"
            detail={controller.sessionReady ? '会话已激活' : '无活动会话'}
            status={controller.sessionReady ? 'online' : 'idle'}
          />
          <StatusItem
            label="状态通道"
            detail={channelLabels[controller.stateChannel]}
            status={controller.stateChannel === 'websocket' ? 'online' : controller.stateChannel === 'polling' ? 'warning' : 'offline'}
          />
        </div>

        <div className="grid items-start gap-4 xl:grid-cols-12">
          <Panel
            title="运动控制"
            eyebrow="Motion control"
            icon={<Gamepad2 />}
            className="xl:col-span-8"
            action={
              <div className="flex items-center gap-2 text-[11px] text-slate-500">
                <span className={cn('size-1.5 rounded-full', canControl ? 'bg-emerald-400' : 'bg-slate-600')} />
                <span className="hidden sm:inline">{controlHint}</span>
                <span className="sm:hidden">{canControl ? '可控制' : '控制锁定'}</span>
              </div>
            }
          >
            <div className="grid gap-5 md:grid-cols-[minmax(260px,1.1fr)_minmax(240px,0.9fr)] lg:gap-7">
              <div>
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-[11px] font-medium tracking-wide text-slate-500">平面移动</p>
                  <span className="font-mono text-[9px] uppercase tracking-wider text-slate-600">Hold to move</span>
                </div>
                <div className="mx-auto grid max-w-[340px] grid-cols-3 gap-2.5">
                  <div />
                  <ControlButton label="前进" keyLabel="W" icon={<ArrowUp />} {...controlProps('forward')} />
                  <div />
                  <ControlButton label="左移" keyLabel="A" icon={<ArrowLeft />} {...controlProps('left')} />
                  <div className="flex min-h-[72px] items-center justify-center rounded-md border border-dashed border-slate-800 bg-slate-950/25 text-slate-700">
                    <Move className="size-5" />
                  </div>
                  <ControlButton label="右移" keyLabel="D" icon={<ArrowRight />} {...controlProps('right')} />
                  <div />
                  <ControlButton label="后退" keyLabel="S" icon={<ArrowDown />} {...controlProps('backward')} />
                  <div />
                </div>
                <p className="mt-3 text-center text-[11px] text-slate-600 md:hidden">{controlHint}</p>
              </div>

              <div className="flex flex-col gap-4 border-t border-slate-800/80 pt-5 md:border-l md:border-t-0 md:pl-6 md:pt-0">
                <div>
                  <p className="mb-3 text-[11px] font-medium tracking-wide text-slate-500">姿态与旋转</p>
                  <div className="grid grid-cols-2 gap-2.5">
                    <ControlButton label="左转" keyLabel="Z" icon={<RotateCcw />} {...controlProps('rotateLeft')} />
                    <ControlButton label="右转" keyLabel="X" icon={<RotateCw />} {...controlProps('rotateRight')} />
                  </div>
                  <ControlButton
                    label="下蹲 · 高度 0.30 m"
                    keyLabel="C"
                    icon={<ChevronsDown />}
                    {...controlProps('crouch')}
                    className="mt-2.5 min-h-[62px] w-full"
                  />
                </div>

                <button
                  type="button"
                  onClick={controller.stop}
                  disabled={stopping}
                  className="flex min-h-[76px] w-full items-center justify-center gap-3 rounded-md border border-red-500/50 bg-red-500/15 px-4 text-red-300 outline-none transition-colors hover:border-red-400 hover:bg-red-500/25 focus-visible:ring-2 focus-visible:ring-red-400/60 disabled:opacity-60"
                >
                  {stopping ? <LoaderCircle className="size-6 animate-spin" /> : <Octagon className="size-6" strokeWidth={2.2} />}
                  <span className="text-left">
                    <span className="block text-sm font-bold tracking-[0.12em]">软件停止</span>
                    <span className="mt-1 block font-mono text-[9px] tracking-wider text-red-400/70">SPACE / ESC</span>
                  </span>
                </button>
              </div>
            </div>

            <div className="mt-6 grid gap-5 border-t border-slate-800/80 pt-5 sm:grid-cols-2">
              <div>
                <div className="mb-3 flex items-center justify-between text-xs">
                  <span className="flex items-center gap-2 font-medium text-slate-400"><Gauge className="size-3.5" />移动速度档位</span>
                  <span className="font-mono text-cyan-300">{controller.linearSpeed.toFixed(1)} <span className="text-slate-600">m/s</span></span>
                </div>
                <Slider
                  aria-label="移动速度档位"
                  min={0.1}
                  max={1.5}
                  step={0.1}
                  value={[controller.linearSpeed]}
                  onValueChange={([value]) => controller.changeLinearSpeed(value)}
                  className="[&_[data-slot=slider-range]]:bg-cyan-400 [&_[data-slot=slider-thumb]]:size-3.5 [&_[data-slot=slider-thumb]]:border-cyan-300"
                />
                <div className="mt-2 flex justify-between font-mono text-[9px] text-slate-600"><span>0.1 低速</span><span>1.5 高速</span></div>
              </div>
              <div>
                <div className="mb-3 flex items-center justify-between text-xs">
                  <span className="flex items-center gap-2 font-medium text-slate-400"><RotateCw className="size-3.5" />旋转速度档位</span>
                  <span className="font-mono text-cyan-300">{controller.angularSpeed.toFixed(1)} <span className="text-slate-600">rad/s</span></span>
                </div>
                <Slider
                  aria-label="旋转速度档位"
                  min={0.2}
                  max={2}
                  step={0.1}
                  value={[controller.angularSpeed]}
                  onValueChange={([value]) => controller.changeAngularSpeed(value)}
                  className="[&_[data-slot=slider-range]]:bg-cyan-400 [&_[data-slot=slider-thumb]]:size-3.5 [&_[data-slot=slider-thumb]]:border-cyan-300"
                />
                <div className="mt-2 flex justify-between font-mono text-[9px] text-slate-600"><span>0.2 低速</span><span>2.0 高速</span></div>
              </div>
            </div>
          </Panel>

          <div className="space-y-4 xl:col-span-4">
            <Panel title="机器人与任务" eyebrow="Robot profile" icon={<Bot />}>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-4">
                <div className="col-span-2">
                  <dt className="mb-1 text-[10px] uppercase tracking-wider text-slate-600">当前任务</dt>
                  <dd className="truncate text-sm font-medium text-slate-200">{state.task || '—'}</dd>
                </div>
                <div>
                  <dt className="mb-1 text-[10px] uppercase tracking-wider text-slate-600">机器人类型</dt>
                  <dd className="truncate font-mono text-xs text-slate-300">{state.robot_type || '—'}</dd>
                </div>
                <div>
                  <dt className="mb-1 text-[10px] uppercase tracking-wider text-slate-600">全身控制</dt>
                  <dd className={cn('text-xs font-medium', state.wholebody ? 'text-emerald-400' : 'text-slate-500')}>
                    {state.wholebody ? '已启用' : '未启用'}
                  </dd>
                </div>
              </dl>
              <div className="mt-4 border-t border-slate-800/70 pt-3">
                <p className="mb-2 text-[10px] uppercase tracking-wider text-slate-600">能力标识</p>
                <div className="flex flex-wrap gap-1.5">
                  {state.capabilities.length > 0 ? state.capabilities.map((capability) => (
                    <span key={capability} className="rounded border border-slate-700/80 bg-slate-800/40 px-2 py-1 font-mono text-[9px] text-slate-400">
                      {capability}
                    </span>
                  )) : <span className="text-xs text-slate-600">暂无能力信息</span>}
                </div>
              </div>
            </Panel>

            <Panel
              title="当前指令"
              eyebrow="Live command"
              icon={<Activity />}
              action={<span className={cn('font-mono text-[9px] uppercase tracking-widest', activeActions.length ? 'text-cyan-400' : 'text-slate-600')}>{activeActions.length ? 'OUTPUT' : 'IDLE'}</span>}
            >
              <div className="grid grid-cols-2 overflow-hidden rounded-md border border-slate-800 bg-slate-950/35">
                {[
                  ['X 线速度', currentCommand.x_vel, 'm/s'],
                  ['Y 线速度', currentCommand.y_vel, 'm/s'],
                  ['偏航速度', currentCommand.yaw_vel, 'rad/s'],
                  ['机身高度', currentCommand.height, 'm'],
                ].map(([label, value, unit], index) => (
                  <div key={label as string} className={cn('p-3', index % 2 === 0 && 'border-r border-slate-800', index < 2 && 'border-b border-slate-800')}>
                    <p className="text-[10px] text-slate-600">{label}</p>
                    <p className="mt-1.5 font-mono text-lg font-medium tabular-nums text-slate-200">
                      {Number(value).toFixed(2)} <span className="text-[9px] font-normal text-slate-600">{unit}</span>
                    </p>
                  </div>
                ))}
              </div>
              <div className="mt-3 space-y-2 text-[10px]">
                <div className="flex items-start justify-between gap-3">
                  <span className="flex shrink-0 items-center gap-1.5 text-slate-600"><Clock3 className="size-3" />最近命令</span>
                  <span className="text-right font-mono text-slate-400">{formatTime(state.last_command_at)}</span>
                </div>
                <div className="flex items-start justify-between gap-3">
                  <span className="flex shrink-0 items-center gap-1.5 text-slate-600"><Radio className="size-3" />状态更新</span>
                  <span className="text-right font-mono text-slate-500">{formatTime(state.timestamp)}</span>
                </div>
              </div>
              {visibleError && (
                <div role="alert" className="mt-4 flex items-start gap-2 rounded-md border border-red-500/25 bg-red-500/[0.06] p-3 text-xs leading-relaxed text-red-300">
                  <CircleAlert className="mt-0.5 size-4 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="mb-1 font-semibold">最近错误</p>
                    <p className="break-words text-red-300/80">{visibleError}</p>
                  </div>
                  <button type="button" aria-label="关闭错误提示" onClick={controller.clearError} className="text-red-400/60 hover:text-red-300"><X className="size-3.5" /></button>
                </div>
              )}
            </Panel>
          </div>
        </div>

        <div className="grid items-start gap-4 xl:grid-cols-12">
          <Panel
            title="操作日志"
            eyebrow="Event stream"
            icon={<TerminalSquare />}
            className="xl:col-span-8"
            bodyClassName="p-0"
            action={
              <Button type="button" variant="ghost" size="sm" onClick={controller.clearLogs} disabled={logs.length === 0} className="h-7 text-[10px] text-slate-500 hover:text-slate-300">
                <Eraser className="size-3" />清空日志
              </Button>
            }
          >
            <ScrollArea className="h-[220px]">
              <div className="divide-y divide-slate-800/60">
                {logs.length > 0 ? logs.map((log) => (
                  <div key={log.id} className="flex items-start gap-3 px-4 py-2.5 font-mono text-[11px] sm:px-5">
                    <span className="shrink-0 text-slate-600">{log.time}</span>
                    <span className={cn('w-12 shrink-0 uppercase', logStyles[log.level])}>{log.level}</span>
                    <span className="leading-relaxed text-slate-400">{log.message}</span>
                  </div>
                )) : (
                  <div className="flex h-[218px] items-center justify-center text-xs text-slate-600">暂无操作日志</div>
                )}
              </div>
            </ScrollArea>
          </Panel>

          <Panel title="仿真操作" eyebrow="Simulation actions" icon={<Box />} className="xl:col-span-4">
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-medium text-slate-300">复位仿真</p>
                  <p className="mt-1 text-[10px] text-slate-600">停止当前运动并恢复初始状态</p>
                </div>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button type="button" variant="outline" size="sm" disabled={!state.connected || isBusy} className="border-slate-700 bg-slate-800/40 text-slate-300 hover:bg-slate-800 hover:text-white">
                      {busy === 'reset' ? <LoaderCircle className="animate-spin" /> : <RefreshCcw />}
                      复位
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent className="border-slate-700 bg-[#11161d] text-slate-200">
                    <AlertDialogHeader>
                      <AlertDialogTitle>确认复位仿真？</AlertDialogTitle>
                      <AlertDialogDescription className="text-slate-400">
                        系统将先发送软件停止指令，再执行类别 0 的仿真复位。当前任务进度与机器人姿态可能丢失。
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel className="border-slate-700 bg-slate-900 text-slate-300 hover:bg-slate-800 hover:text-white">取消</AlertDialogCancel>
                      <AlertDialogAction onClick={controller.reset} className="bg-amber-400 text-slate-950 hover:bg-amber-300">确认复位</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>

              {state.capabilities.includes('gripper') && (
                <div className="border-t border-slate-800/80 pt-4">
                  <div className="mb-3 flex items-center gap-2">
                    <Grip className="size-4 text-slate-500" />
                    <div>
                      <p className="text-xs font-medium text-slate-300">夹爪控制</p>
                      <p className="mt-1 text-[10px] text-slate-600">执行前自动停止机器人运动</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Button type="button" variant="outline" disabled={!state.connected || isBusy} onClick={() => controller.setGripper(1)} className="border-slate-700 bg-slate-800/40 text-slate-300 hover:bg-slate-800 hover:text-white">
                      {busy === 'gripper' ? <LoaderCircle className="animate-spin" /> : <Hand />}张开夹爪
                    </Button>
                    <Button type="button" variant="outline" disabled={!state.connected || isBusy} onClick={() => controller.setGripper(0)} className="border-slate-700 bg-slate-800/40 text-slate-300 hover:bg-slate-800 hover:text-white">
                      <Grip />闭合夹爪
                    </Button>
                  </div>
                </div>
              )}

              <div className="rounded-md border border-slate-800 bg-slate-950/30 p-3 text-[10px] leading-relaxed text-slate-600">
                复位与夹爪操作均通过当前后端执行。Mock 模式仅返回模拟结果，不会驱动物理设备。
              </div>
            </div>
          </Panel>
        </div>

        <footer className="flex flex-col gap-3 border-t border-slate-800/70 py-3 text-[10px] text-slate-600 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <span className="flex items-center gap-1.5"><Keyboard className="size-3.5" />W/S/A/D 移动</span>
            <span>Z/X 旋转</span><span>C 下蹲</span><span>空格 / Esc 停止</span>
          </div>
          <div className="flex items-center gap-4 font-mono">
            <span className="flex items-center gap-1.5"><Server className="size-3" />127.0.0.1:8000</span>
            <span className="flex items-center gap-1.5"><Cpu className="size-3" />{state.mode.toUpperCase()}</span>
            <span className="flex items-center gap-1.5"><Wifi className="size-3" />{controller.stateChannel === 'websocket' ? 'LIVE' : 'FALLBACK'}</span>
          </div>
        </footer>
      </main>
    </div>
  )
}
