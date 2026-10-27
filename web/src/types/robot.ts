export type BackendMode = 'mock' | 'mcp'

export interface VelocityCommand {
  x_vel: number
  y_vel: number
  yaw_vel: number
  height: number
}

export interface RobotState {
  mode: BackendMode
  connected: boolean
  mcp_connected: boolean
  simulation_connected: boolean
  controllable: boolean
  task: string
  robot_type: string
  wholebody: boolean
  last_command: VelocityCommand | null
  last_command_at: string | null
  last_error: string | null
  session_active: boolean
  timestamp: string
  capabilities: string[]
}

export interface HealthResponse {
  status: 'ok'
  mode: BackendMode
}

export type ControlAction =
  | 'forward'
  | 'backward'
  | 'left'
  | 'right'
  | 'rotateLeft'
  | 'rotateRight'
  | 'crouch'

export type LogLevel = 'info' | 'success' | 'warning' | 'error'

export interface OperationLog {
  id: number
  time: string
  level: LogLevel
  message: string
}

export type StateChannel = 'connecting' | 'websocket' | 'polling' | 'offline'

export const EMPTY_COMMAND: VelocityCommand = {
  x_vel: 0,
  y_vel: 0,
  yaw_vel: 0,
  height: 0.8,
}

export const INITIAL_ROBOT_STATE: RobotState = {
  mode: 'mock',
  connected: false,
  mcp_connected: false,
  simulation_connected: false,
  controllable: false,
  task: '等待连接',
  robot_type: '—',
  wholebody: false,
  last_command: null,
  last_command_at: null,
  last_error: null,
  session_active: false,
  timestamp: '',
  capabilities: [],
}
