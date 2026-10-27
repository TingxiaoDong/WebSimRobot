import { useCallback, useEffect, useRef, useState } from 'react'
import { robotApi } from '@/lib/robot-api'
import {
  EMPTY_COMMAND,
  INITIAL_ROBOT_STATE,
  type ControlAction,
  type LogLevel,
  type OperationLog,
  type RobotState,
  type StateChannel,
  type VelocityCommand,
} from '@/types/robot'

const KEY_MAP: Record<string, ControlAction> = {
  w: 'forward',
  s: 'backward',
  a: 'left',
  d: 'right',
  z: 'rotateLeft',
  x: 'rotateRight',
  c: 'crouch',
}

function timeNow() {
  return new Date().toLocaleTimeString('zh-CN', { hour12: false })
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

export function useRobotController() {
  const [state, setState] = useState<RobotState>(INITIAL_ROBOT_STATE)
  const [sessionReady, setSessionReady] = useState(false)
  const [stateChannel, setStateChannel] = useState<StateChannel>('connecting')
  const [backendOnline, setBackendOnline] = useState(false)
  const [busy, setBusy] = useState<'connect' | 'disconnect' | 'reset' | 'gripper' | null>(null)
  const [stopping, setStopping] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)
  const [linearSpeed, setLinearSpeed] = useState(0.3)
  const [angularSpeed, setAngularSpeed] = useState(0.8)
  const [activeActions, setActiveActions] = useState<ControlAction[]>([])
  const [logs, setLogs] = useState<OperationLog[]>([
    { id: 0, time: timeNow(), level: 'info', message: '控制台已加载，等待连接仿真后端' },
  ])

  const stateRef = useRef(state)
  const sessionRef = useRef<string | null>(null)
  const sequenceRef = useRef(0)
  const activeRef = useRef<Set<ControlAction>>(new Set())
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const heartbeatPendingRef = useRef(false)
  const logIdRef = useRef(1)
  const linearSpeedRef = useRef(linearSpeed)
  const angularSpeedRef = useRef(angularSpeed)

  const canControl =
    state.connected && state.controllable && state.wholebody && sessionReady
  const canControlRef = useRef(canControl)
  canControlRef.current = canControl

  const addLog = useCallback((level: LogLevel, message: string) => {
    setLogs((previous) => {
      if (level === 'error' && previous[0]?.level === 'error' && previous[0].message === message) {
        return previous
      }
      const entry = { id: logIdRef.current++, time: timeNow(), level, message }
      return [entry, ...previous].slice(0, 100)
    })
  }, [])

  const applyState = useCallback((next: RobotState) => {
    stateRef.current = next
    setState(next)
    setBackendOnline(true)
    if (!next.connected) {
      sessionRef.current = null
      setSessionReady(false)
    }
  }, [])

  const clearActive = useCallback(() => {
    activeRef.current.clear()
    setActiveActions([])
    if (heartbeatRef.current) {
      clearInterval(heartbeatRef.current)
      heartbeatRef.current = null
    }
    heartbeatPendingRef.current = false
  }, [])

  const sendStop = useCallback(
    async (withLog = false) => {
      clearActive()
      setStopping(true)
      try {
        const result = await robotApi.stop(sessionRef.current ?? undefined)
        if (robotApi.isRobotState(result)) applyState(result)
        if (withLog) addLog('warning', '已发送软件停止指令')
      } catch (error) {
        const message = `停止指令发送失败：${errorMessage(error)}`
        setLocalError(message)
        addLog('error', message)
      } finally {
        setStopping(false)
      }
    },
    [addLog, applyState, clearActive],
  )

  const handleApiError = useCallback(
    (error: unknown, context: string) => {
      const message = `${context}：${errorMessage(error)}`
      setLocalError(message)
      addLog('error', `${message}，已触发软件停止`)
      void sendStop(false)
    },
    [addLog, sendStop],
  )

  const getCommand = useCallback((): VelocityCommand => {
    const active = activeRef.current
    const x = Number(active.has('forward')) - Number(active.has('backward'))
    const y = Number(active.has('left')) - Number(active.has('right'))
    const yaw = Number(active.has('rotateLeft')) - Number(active.has('rotateRight'))
    return {
      x_vel: x * linearSpeedRef.current,
      y_vel: y * linearSpeedRef.current,
      yaw_vel: yaw * angularSpeedRef.current,
      height: active.has('crouch') ? 0.3 : 0.8,
    }
  }, [])

  const startHeartbeat = useCallback(() => {
    if (heartbeatRef.current) clearInterval(heartbeatRef.current)
    heartbeatRef.current = setInterval(() => {
      const sessionId = sessionRef.current
      if (!sessionId || activeRef.current.size === 0 || heartbeatPendingRef.current) return
      heartbeatPendingRef.current = true
      const sequence = ++sequenceRef.current
      robotApi
        .heartbeat(sessionId, sequence)
        .catch((error) => handleApiError(error, '心跳发送失败'))
        .finally(() => {
          heartbeatPendingRef.current = false
        })
    }, 100)
  }, [handleApiError])

  const emitCommand = useCallback(() => {
    const sessionId = sessionRef.current
    if (!sessionId || !canControlRef.current || activeRef.current.size === 0) return
    const command = getCommand()
    const sequence = ++sequenceRef.current
    robotApi
      .move(sessionId, sequence, command)
      .then((result) => {
        if (robotApi.isRobotState(result)) applyState(result)
      })
      .catch((error) => handleApiError(error, '运动指令发送失败'))
    startHeartbeat()
  }, [applyState, getCommand, handleApiError, startHeartbeat])

  const press = useCallback(
    (action: ControlAction) => {
      if (!canControlRef.current || activeRef.current.has(action)) return
      activeRef.current.add(action)
      setActiveActions(Array.from(activeRef.current))
      emitCommand()
    },
    [emitCommand],
  )

  const release = useCallback(
    (action: ControlAction) => {
      if (!activeRef.current.delete(action)) return
      setActiveActions(Array.from(activeRef.current))
      if (activeRef.current.size > 0) emitCommand()
      else void sendStop(false)
    },
    [emitCommand, sendStop],
  )

  const connect = useCallback(async () => {
    setBusy('connect')
    setLocalError(null)
    try {
      const connectedState = await robotApi.connect()
      applyState(connectedState)
      if (!connectedState.connected) throw new Error('后端未进入已连接状态')
      const session = await robotApi.session()
      sessionRef.current = session.session_id
      setSessionReady(true)
      const sessionState = { ...connectedState, session_active: true }
      applyState(sessionState)
      addLog('success', `仿真连接成功，控制会话 ${session.session_id.slice(0, 8)} 已建立`)
    } catch (error) {
      handleApiError(error, '连接失败')
    } finally {
      setBusy(null)
    }
  }, [addLog, applyState, handleApiError])

  const disconnect = useCallback(async () => {
    setBusy('disconnect')
    await sendStop(false)
    sessionRef.current = null
    setSessionReady(false)
    try {
      const result = await robotApi.disconnect()
      applyState(result)
      addLog('info', '已断开仿真连接并停止控制会话')
    } catch (error) {
      handleApiError(error, '断开连接失败')
    } finally {
      setBusy(null)
    }
  }, [addLog, applyState, handleApiError, sendStop])

  const reset = useCallback(async () => {
    setBusy('reset')
    await sendStop(false)
    try {
      const result = await robotApi.reset(1)
      addLog('success', result.message || '仿真复位完成（类别 1）')
    } catch (error) {
      handleApiError(error, '仿真复位失败')
    } finally {
      setBusy(null)
    }
  }, [addLog, handleApiError, sendStop])

  const setGripper = useCallback(
    async (position: number) => {
      setBusy('gripper')
      await sendStop(false)
      try {
        await robotApi.gripper(position)
        addLog('success', position >= 0.5 ? '夹爪已张开' : '夹爪已闭合')
      } catch (error) {
        handleApiError(error, '夹爪控制失败')
      } finally {
        setBusy(null)
      }
    },
    [addLog, handleApiError, sendStop],
  )

  const changeLinearSpeed = useCallback((value: number) => {
    linearSpeedRef.current = value
    setLinearSpeed(value)
    if (activeRef.current.size > 0) emitCommand()
  }, [emitCommand])

  const changeAngularSpeed = useCallback((value: number) => {
    angularSpeedRef.current = value
    setAngularSpeed(value)
    if (activeRef.current.size > 0) emitCommand()
  }, [emitCommand])

  useEffect(() => {
    if (!canControl && activeRef.current.size > 0) void sendStop(false)
  }, [canControl, sendStop])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase()
      if (key === ' ' || key === 'escape') {
        event.preventDefault()
        void sendStop(true)
        return
      }
      if (event.repeat || event.metaKey || event.ctrlKey || event.altKey) return
      const target = event.target as HTMLElement | null
      if (target?.matches('input, textarea, select, [contenteditable="true"]')) return
      const action = KEY_MAP[key]
      if (!action || !canControlRef.current) return
      event.preventDefault()
      press(action)
    }
    const onKeyUp = (event: KeyboardEvent) => {
      const action = KEY_MAP[event.key.toLowerCase()]
      if (action) {
        event.preventDefault()
        release(action)
      }
    }
    const onBlur = () => {
      if (activeRef.current.size > 0) void sendStop(false)
      else clearActive()
    }
    const onVisibility = () => {
      if (document.hidden) onBlur()
    }
    const onPageHide = () => void sendStop(false)

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', onBlur)
    window.addEventListener('pagehide', onPageHide)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlur)
      window.removeEventListener('pagehide', onPageHide)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [clearActive, press, release, sendStop])

  useEffect(() => {
    let disposed = false
    let socket: WebSocket | null = null
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null

    const connectSocket = () => {
      if (disposed) return
      setStateChannel('connecting')
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      socket = new WebSocket(`${protocol}//${window.location.host}/ws/state`)
      socket.onopen = () => {
        if (!disposed) setStateChannel('websocket')
      }
      socket.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data) as { type?: string; data?: RobotState }
          if (message.type === 'state' && message.data) applyState(message.data)
        } catch (error) {
          addLog('error', `状态数据解析失败：${errorMessage(error)}`)
        }
      }
      socket.onerror = () => socket?.close()
      socket.onclose = () => {
        if (disposed) return
        setStateChannel('offline')
        if (activeRef.current.size > 0) void sendStop(false)
        reconnectTimer = setTimeout(connectSocket, 3000)
      }
    }

    void robotApi.health()
      .then(() => setBackendOnline(true))
      .catch((error) => {
        setBackendOnline(false)
        handleApiError(error, '健康检查失败')
      })
    void robotApi.state()
      .then(applyState)
      .catch((error) => handleApiError(error, '状态获取失败'))
    connectSocket()

    const pollTimer = setInterval(() => {
      if (socket?.readyState === WebSocket.OPEN || disposed) return
      setStateChannel('polling')
      void robotApi.state()
        .then(applyState)
        .catch((error) => {
          setBackendOnline(false)
          handleApiError(error, '降级状态轮询失败')
        })
    }, 1000)

    return () => {
      disposed = true
      clearInterval(pollTimer)
      if (reconnectTimer) clearTimeout(reconnectTimer)
      socket?.close()
    }
  }, [addLog, applyState, handleApiError, sendStop])

  const currentCommand = activeActions.length > 0 ? getCommand() : EMPTY_COMMAND
  const visibleError = localError || state.last_error

  return {
    state,
    busy,
    stopping,
    stateChannel,
    backendOnline,
    canControl,
    sessionReady,
    linearSpeed,
    angularSpeed,
    activeActions,
    currentCommand,
    visibleError,
    logs,
    connect,
    disconnect,
    reset,
    setGripper,
    press,
    release,
    stop: () => void sendStop(true),
    clearError: () => setLocalError(null),
    changeLinearSpeed,
    changeAngularSpeed,
    clearLogs: () => setLogs([]),
  }
}
