import { create } from 'zustand';
import type { JointState, ArmMode, LogEntry, ArmCommand, UrdfLimits } from './types';
import { commandBus } from './bus/commandBus';
import { fsm } from './fsm';

export type ControlMode = 'JOYSTICK' | 'MOUSE' | 'KEYBOARD' | 'VOICE' | 'PIN' | 'AGENTIC';

// Hardcoded fallback HOME_JOINTS if URDF hasn't loaded
export const HOME_JOINTS: JointState = {
  joint_1: 0,
  joint_2: 0,
  joint_3: 0,
  joint_4: 0,
  joint_5: 0,
  joint_6: 0,
};

interface AppState {
  joints: JointState;
  setJoints: (joints: Partial<JointState>) => void;
  
  urdfLimits: UrdfLimits;
  setUrdfLimits: (limits: UrdfLimits) => void;

  mode: ArmMode;
  setMode: (mode: ArmMode) => void;
  
  controlMode: ControlMode;
  setControlMode: (mode: ControlMode) => void;
  
  showGrid: boolean;
  setShowGrid: (show: boolean) => void;
  
  gizmoMode: 'translate' | 'rotate';
  setGizmoMode: (mode: 'translate' | 'rotate') => void;
  
  activeJoint: number;
  setActiveJoint: (joint: number) => void;
  
  cameraMode: boolean;
  setCameraMode: (mode: boolean) => void;
  
  stepSize: number;
  setStepSize: (size: number) => void;
  
  rpm: number;
  setRpm: (rpm: number) => void;
  
  backendError: string | null;
  setError: (msg: string | null) => void;
  
  isEStop: boolean;
  triggerEStop: () => void;
  resetEStop: () => void;

  logs: LogEntry[];
  addLog: (log: Omit<LogEntry, 'id' | 'timestamp'>) => void;
  
  activeCommand: ArmCommand | null;
  setActiveCommand: (cmd: ArmCommand | null) => void;

  activeSequenceDigit: string | null;
  setActiveSequenceDigit: (digit: string | null) => void;
}

export const useStore = create<AppState>((set) => ({
  joints: HOME_JOINTS,
  setJoints: (jointsUpdate) => set((state) => ({ joints: { ...state.joints, ...jointsUpdate } })),
  
  urdfLimits: {},
  setUrdfLimits: (urdfLimits) => set({ urdfLimits }),

  mode: 'REST',
  setMode: (mode) => set({ mode }),
  
  controlMode: 'JOYSTICK',
  setControlMode: (controlMode) => set({ controlMode }),
  
  showGrid: true,
  setShowGrid: (showGrid) => set({ showGrid }),
  
  gizmoMode: 'translate',
  setGizmoMode: (gizmoMode) => set({ gizmoMode }),
  
  activeJoint: 1,
  setActiveJoint: (activeJoint) => set({ activeJoint }),
  
  cameraMode: false,
  setCameraMode: (cameraMode) => set({ cameraMode }),
  
  stepSize: 0.05,
  setStepSize: (stepSize) => set({ stepSize }),
  
  rpm: 20,
  setRpm: (rpm) => set({ rpm, stepSize: (rpm * 2 * Math.PI / 60) * 0.1 }),
  
  backendError: null,
  setError: (backendError) => set({ backendError, mode: backendError ? 'ERROR' : 'REST' }),
  
  isEStop: false,
  // Keep the safety FSM in lock-step with the UI flag: previously the top-bar
  // STOP/RESET button only flipped the store, leaving the FSM stuck in STOP and
  // silently rejecting every later voice/agent command.
  triggerEStop: () => {
    fsm.eStop();
    set({ isEStop: true, mode: 'STOP', activeCommand: null });
  },
  resetEStop: () => {
    fsm.reset();
    set({ isEStop: false, mode: 'REST', backendError: null });
  },
  
  logs: [],
  addLog: (logInfo) => set((state) => ({
    logs: [{ id: crypto.randomUUID(), timestamp: Date.now(), ...logInfo }, ...state.logs].slice(0, 100)
  })),
  
  activeCommand: null,
  setActiveCommand: async (cmd) => {
    set({ activeCommand: cmd });
    if (cmd) {
      await commandBus.submit(cmd);
    }
  },

  activeSequenceDigit: null,
  setActiveSequenceDigit: (activeSequenceDigit) => set({ activeSequenceDigit }),
}));
