import type { HealthResponse, RobotState, VelocityCommand } from '@/types/robot'

type ApiErrorBody = { detail?: string; message?: string }

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  })

  const text = await response.text()
  let data: unknown = null
  if (text) {
    try {
      data = JSON.parse(text)
    } catch {
      data = text
    }
  }

  if (!response.ok) {
    const body = (data ?? {}) as ApiErrorBody
    const detail = body.detail || body.message || (typeof data === 'string' ? data : '')
    throw new Error(detail || `HTTP ${response.status} ${response.statusText}`)
  }

  return data as T
}

function post<T>(path: string, body?: unknown, keepalive = false): Promise<T> {
  return request<T>(path, {
    method: 'POST',
    body: body === undefined ? undefined : JSON.stringify(body),
    keepalive,
  })
}

function isRobotState(value: RobotState | { status: 'ok' }): value is RobotState {
  return 'connected' in value
}

export const robotApi = {
  health: () => request<HealthResponse>('/api/health'),
  state: () => request<RobotState>('/api/state'),
  connect: () => post<RobotState>('/api/connect', {}),
  session: () => post<{ session_id: string }>('/api/session', {}),
  disconnect: () => post<RobotState>('/api/disconnect'),
  move: (sessionId: string, sequence: number, command: VelocityCommand) =>
    post<RobotState | { status: 'ok' }>('/api/control/move', {
      session_id: sessionId,
      sequence,
      ...command,
    }),
  heartbeat: (sessionId: string, sequence: number) =>
    post<{ status: 'ok' }>('/api/control/heartbeat', {
      session_id: sessionId,
      sequence,
    }),
  stop: (sessionId?: string) =>
    post<RobotState | { status: 'ok' }>('/api/control/stop', {
      session_id: sessionId,
    }, true),
  reset: (category: number) =>
    post<{ status: 'ok'; message?: string }>('/api/actions/reset', { category }),
  gripper: (position: number) =>
    post<{ status: 'ok' }>('/api/actions/gripper', { position }),
  isRobotState,
}
