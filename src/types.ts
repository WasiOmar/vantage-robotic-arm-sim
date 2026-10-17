export interface JointState {
  joint_1: number;
  joint_2: number;
  joint_3: number;
  joint_4: number;
  joint_5: number;
  joint_6: number;
}

export interface UrdfLimits {
  [jointName: string]: { min: number; max: number; effort?: number; velocity?: number };
}

import type { CommandSource, ArmCommand } from './types/commands';

export type { CommandSource, ArmCommand };

export type SafetyRejectReason = 
  | 'OUT_OF_BOUNDS'
  | 'JOINT_LIMIT_VIOLATION'
  | 'Z_COLLISION'
  | 'SELF_COLLISION'
  | 'VELOCITY_CLAMP_VIOLATION'
  | 'UNREACHABLE_TARGET';

export interface SafetyReport {
  safe: boolean;
  reasons: SafetyRejectReason[];
  details: string[]; // Machine readable details for the agentic layer
}

export type ArmMode = 'REST' | 'JOGGING' | 'EXECUTE' | 'ERROR' | 'STOP' | 'AUTONOMOUS_SEQUENCE' | 'AUTONOMOUS_PAUSED';

export interface LogEntry {
  id: string;
  timestamp: number;
  source: CommandSource | "SYSTEM";
  type: 'info' | 'warn' | 'error' | 'success';
  message: string;
  commandId?: string;
  
  // Structured Session Log fields (Layer 6)
  verdict?: "ACCEPTED" | "REJECTED";
  rejectReason?: SafetyRejectReason;
  ikError?: number;
  finalTipError?: number;
  target?: any;
}
