export type CommandSource = 'dashboard' | 'joystick' | 'keyboard' | 'mouse' | 'voice' | 'agentic' | 'autonomous' | 'typed' | 'agent';

export type CommandType =
  | 'moveTo'
  | 'jog'
  | 'setJoint'
  | 'press_key'
  | 'enter_pin'
  | 'rotate_joint'
  | 'goto'
  | 'estop'
  | 'reset'
  | 'set_speed'
  | 'wait';

export interface ArmCommand {
  id: string;
  source: CommandSource;
  type: CommandType;
  target?: { x: number; y: number; z: number; approach?: [number, number, number]; quat?: [number, number, number, number] };
  targetName?: 'home';
  delta?: { x: number; y: number; z: number; rx?: number; ry?: number; rz?: number };
  joint?: { name: string; value?: number; delta?: number };
  keyIndex?: number;
  digits?: number[];
  jointIndex?: number;
  absRad?: number;
  deltaRad?: number;
  /** set_speed: absolute RPM, or a multiplier applied to the current RPM */
  rpm?: number;
  speedScale?: number;
  /** wait: pause length in milliseconds */
  durationMs?: number;
  timestamp: number;
}
