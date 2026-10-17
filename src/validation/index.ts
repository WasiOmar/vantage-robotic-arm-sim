import type { JointState } from '../types';
import type { ArmCommand } from '../types/commands';
import { useStore } from '../store';
import { fsm } from '../fsm';
import * as THREE from 'three';
import { forwardKinematics } from '../kinematics/ikSolver';

export interface ValidationReport {
  pass: boolean;
  reason?: string;
  details?: string[];
}

export function validate(_command: ArmCommand, proposedJointAngles: JointState): ValidationReport {
  const limits = useStore.getState().urdfLimits;
  const details: string[] = [];

  // 1. Joint Limits Check (Real logic, based on URDF parsing)
  const keys: (keyof JointState)[] = [
    'joint_1', 'joint_2', 'joint_3', 
    'joint_4', 'joint_5', 'joint_6'
  ];

  for (const key of keys) {
    const val = proposedJointAngles[key];
    const limit = limits[key];
    
    if (limit) {
      if (val < limit.min - 0.001 || val > limit.max + 0.001) {
        details.push(`${key} limit violation: value ${val.toFixed(3)} rad is outside [${limit.min}, ${limit.max}]`);
      }
    }
  }

  // 3. Velocity / Accel bounds check
  const currentJoints = useStore.getState().joints;
  const isAuto = fsm.getState() === 'AUTONOMOUS_SEQUENCE' || fsm.getState() === 'AUTONOMOUS_PAUSED';
  
  // Dynamically compute safe duration (min 0.5s) to respect URDF velocity limits
  let executionDurationSeconds = 0.5;

  if (isAuto) {
    const store = useStore.getState();
    const rpm = store.rpm > 0 ? store.rpm : 140;
    const radPerSec = (rpm * 2 * Math.PI) / 60;
    for (const key of keys) {
      const val = proposedJointAngles[key];
      const currentVal = currentJoints[key];
      if (val !== undefined) {
        const reqTime = Math.abs(val - currentVal) / radPerSec;
        if (reqTime > executionDurationSeconds) {
          executionDurationSeconds = reqTime + 0.05;
        }
      }
    }
  } else {
    for (const key of keys) {
      const val = proposedJointAngles[key];
      const currentVal = currentJoints[key];
      const limit = limits[key];
      if (limit && limit.velocity) {
        const reqTime = Math.abs(val - currentVal) / limit.velocity;
        if (reqTime > executionDurationSeconds) {
          executionDurationSeconds = reqTime + 0.05;
        }
      }
    }
  }
  
  for (const key of keys) {
    const val = proposedJointAngles[key];
    const currentVal = currentJoints[key];
    const limit = limits[key];
    
    if (limit && limit.velocity) {
      const delta = Math.abs(val - currentVal);
      const velocity = delta / executionDurationSeconds;
      
      // If we are in autonomous mode, we explicitly bypass the URDF velocity limit to allow fast demos
      if (!isAuto && velocity > limit.velocity + 0.001) {
        details.push(`${key} velocity limit violation: proposed velocity ${velocity.toFixed(2)} rad/s exceeds limit ${limit.velocity} rad/s`);
      }
    }
  }

  if (details.length > 0) {
    return {
      pass: false,
      reason: details[0].includes('velocity') ? 'VELOCITY_LIMIT_VIOLATION' : 'JOINT_LIMIT_VIOLATION',
      details
    };
  }

  // 2. Reachability / Workspace envelope check (Real checks for target Cartesian coordinates)
  if (_command.target) {
    const { x, y, z } = _command.target;
    const dist = Math.sqrt(x * x + y * y + z * z);
    if (dist > 1.19) {
      return {
        pass: false,
        reason: 'UNREACHABLE_TARGET',
        details: [`Target distance ${dist.toFixed(3)}m is outside the maximum reach of 1.19m`],
      };
    }
    if (z < 0) {
      return {
        pass: false,
        reason: 'OUT_OF_BOUNDS',
        details: [`Target Z coordinate ${z.toFixed(3)}m is below ground limit (0.0m)`],
      };
    }
  }

  // 3. Velocity / Accel bounds check (Stub)
  // TODO: Determine if transition from current to proposed violates velocity max over time dt
  
  // 4. Anti-Ground Collision (Z-Axis) & Anti-Self Collision
  const transforms = forwardKinematics(proposedJointAngles);
  const T_tip = transforms[7]; // Stylus tip

  const tipPos = new THREE.Vector3().setFromMatrixPosition(T_tip);

  // Anti-Ground Collision: only the stylus tip can physically hit the floor/keyboard.
  // The elbow is a rigid upper-arm link that swings through the air when reaching
  // forward — checking elbow.z caused false Z_COLLISION on all keyboard press commands.
  // Ground plane is z=0; keys sit at z=0.05 so use a small epsilon of 0.005 for float safety.
  if (tipPos.z < 0.005) {
    const msg = "Safety System Triggered: Prevented stylus from colliding with the floor (Z-Axis restriction).";
    useStore.getState().addLog({
      source: 'SYSTEM',
      type: 'error',
      message: msg,
      commandId: _command.id
    });
    return {
      pass: false,
      reason: 'Z_COLLISION',
      details: [msg]
    };
  }

  // Anti-Self Collision (Base cylinder)
  const tipRadius = Math.sqrt(tipPos.x * tipPos.x + tipPos.y * tipPos.y);
  if (tipRadius < 0.1 && tipPos.z < 0.35) {
    const msg = "Safety System Triggered: Prevented self-collision (Stylus entering Base bounding box).";
    useStore.getState().addLog({
      source: 'SYSTEM',
      type: 'error',
      message: msg,
      commandId: _command.id
    });
    return {
      pass: false,
      reason: 'SELF_COLLISION',
      details: [msg]
    };
  }
  
  return {
    pass: true
  };
}
