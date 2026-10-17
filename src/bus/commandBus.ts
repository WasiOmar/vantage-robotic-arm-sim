import * as THREE from 'three';
import type { ArmCommand } from '../types/commands';
import { fsm } from '../fsm';
import { solveIK, getEndEffectorPose } from '../kinematics';
import { validate } from '../validation';
import { execute } from '../executor';
import { auditLog } from '../audit';
import { useStore, HOME_JOINTS } from '../store';
import type { JointState } from '../types';

let keyConfigCache: Record<string, { x: number; y: number; z: number }> | null = null;

async function loadKeyConfig(): Promise<Record<string, { x: number; y: number; z: number }>> {
  if (keyConfigCache) return keyConfigCache;
  const resp = await fetch('/key.config.json');
  const data = await resp.json();
  keyConfigCache = data.keys;
  return keyConfigCache!;
}

/** Most recent audit reason recorded for a given command id (undefined if none). */
export function getRejectReason(commandId: string): string | undefined {
  const log = auditLog.getLog();
  for (let i = log.length - 1; i >= 0; i--) {
    if (log[i].command.id === commandId) return log[i].reason;
  }
  return undefined;
}

const MIN_RPM = 5;
const MAX_RPM = 140;

class CommandBus {
  public async submit(command: ArmCommand): Promise<string> {
    // Reset must bypass canAccept: its whole purpose is to leave STOP/ERROR.
    if (command.type === 'reset') {
      useStore.getState().resetEStop();
      fsm.reset();
      auditLog.append({
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        command,
        verdict: 'ACCEPTED',
        reason: 'RESET'
      });
      return 'ACCEPTED';
    }

    if (!fsm.canAccept(command)) {
      const reason = 'FSM_REJECTED';
      auditLog.append({
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        command,
        verdict: 'REJECTED',
        reason
      });
      return 'REJECTED';
    }

    if (command.type === 'estop') {
      useStore.getState().triggerEStop();
      auditLog.append({
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        command,
        verdict: 'ACCEPTED',
        reason: 'E-STOP ACTIVATED'
      });
      return 'ACCEPTED';
    }

    if (command.type === 'goto' && command.targetName === 'home') {
      const proposedJoints = HOME_JOINTS;
      const validationReport = validate(command, proposedJoints);
      if (!validationReport.pass) {
        auditLog.append({
          id: crypto.randomUUID(),
          timestamp: Date.now(),
          command,
          verdict: 'REJECTED',
          reason: validationReport.reason
        });
        return 'REJECTED';
      }
      fsm.transitionTo('EXECUTE');
      // Await the motion so chained commands ("go home then press key 2") don't
      // arrive while the FSM is still in EXECUTE and get rejected.
      await execute(proposedJoints);
      if (fsm.getState() === 'STOP') {
        auditLog.append({ id: crypto.randomUUID(), timestamp: Date.now(), command, verdict: 'REJECTED', reason: 'INTERRUPTED_BY_ESTOP' });
        return 'REJECTED';
      }
      auditLog.append({
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        command,
        verdict: 'ACCEPTED'
      });
      return 'ACCEPTED';
    }

    if (command.type === 'set_speed') {
      const store = useStore.getState();
      const base = store.rpm > 0 ? store.rpm : 20;
      const target = command.rpm ?? base * (command.speedScale ?? 1);
      if (!Number.isFinite(target)) {
        auditLog.append({ id: crypto.randomUUID(), timestamp: Date.now(), command, verdict: 'REJECTED', reason: 'INVALID_SPEED' });
        return 'REJECTED';
      }
      store.setRpm(Math.round(Math.min(MAX_RPM, Math.max(MIN_RPM, target))));
      auditLog.append({ id: crypto.randomUUID(), timestamp: Date.now(), command, verdict: 'ACCEPTED', reason: `RPM_${useStore.getState().rpm}` });
      return 'ACCEPTED';
    }

    if (command.type === 'wait') {
      const ms = Math.min(10000, Math.max(0, command.durationMs ?? 1000));
      await new Promise((resolve) => setTimeout(resolve, ms));
      auditLog.append({ id: crypto.randomUUID(), timestamp: Date.now(), command, verdict: 'ACCEPTED' });
      return 'ACCEPTED';
    }

    if (command.type === 'enter_pin') {
      const digits = command.digits ?? [];
      if (digits.length !== 6 || digits.some((d) => !Number.isInteger(d) || d < 1 || d > 6)) {
        auditLog.append({ id: crypto.randomUUID(), timestamp: Date.now(), command, verdict: 'REJECTED', reason: 'INVALID_PIN' });
        return 'REJECTED';
      }
      // Previously this branch only logged ACCEPTED and never moved the arm.
      const { runPinSequence } = await import('../triggers/autonomous');
      let outcome: 'SUCCESS' | 'FAULT' | null = null;
      const pin = digits.join('');
      await runPinSequence(pin, (status) => {
        const highlight = status.status === 'EXECUTING' && status.activeDigitIndex >= 0 &&
          (status.phase === 'descending' || status.phase === 'pressed')
          ? status.pin[status.activeDigitIndex]
          : null;
        useStore.getState().setActiveSequenceDigit(highlight);
        if (status.status === 'SUCCESS' || status.status === 'FAULT') outcome = status.status;
      });
      useStore.getState().setActiveSequenceDigit(null);
      const ok = outcome === 'SUCCESS';
      auditLog.append({
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        command,
        verdict: ok ? 'ACCEPTED' : 'REJECTED',
        reason: ok ? 'PIN_ENTERED' : (fsm.getState() === 'STOP' ? 'INTERRUPTED_BY_ESTOP' : 'PIN_SEQUENCE_FAILED')
      });
      return ok ? 'ACCEPTED' : 'REJECTED';
    }

    let proposedJoints: JointState;
    let ikError = 0;

    if (command.type === 'press_key' && command.keyIndex !== undefined) {
      const keyConfig = await loadKeyConfig();
      const keyData = keyConfig[String(command.keyIndex)];
      if (!keyData) {
        auditLog.append({
          id: crypto.randomUUID(),
          timestamp: Date.now(),
          command,
          verdict: 'REJECTED',
          reason: 'INVALID_KEY_INDEX'
        });
        return 'REJECTED';
      }
      const currentJoints = useStore.getState().joints;
      const target = { x: keyData.x, y: keyData.y, z: keyData.z, approach: [0, 0, -1] as [number, number, number] };
      const ikResult = solveIK(target, currentJoints);
      proposedJoints = ikResult.jointAngles;
      ikError = ikResult.error;
    } else if (command.type === 'setJoint' && command.joint) {
      const jointName = command.joint.name as keyof JointState;
      const currentVal = useStore.getState().joints[jointName] || 0;
      const newVal = command.joint.delta !== undefined ? currentVal + command.joint.delta : (command.joint.value || 0);
      proposedJoints = { ...useStore.getState().joints, [jointName]: newVal };
    } else if (command.type === 'moveTo' && command.target) {
      const currentJoints = useStore.getState().joints;
      const ikResult = solveIK(command.target, currentJoints);
      proposedJoints = ikResult.jointAngles;
      ikError = ikResult.error;
      
      const validationReport = validate(command, proposedJoints);
      if (!validationReport.pass) {
        auditLog.append({
          id: crypto.randomUUID(),
          timestamp: Date.now(),
          command,
          verdict: 'REJECTED',
          reason: validationReport.reason,
          ikError
        });
        useStore.getState().setError(`Command Rejected: ${validationReport.reason}`);
        return 'REJECTED';
      }
      
      if (ikError > 0.8) {
        const reason = `IK_FAILED_TO_CONVERGE (Error: ${ikError.toFixed(4)})`;
        auditLog.append({
          id: crypto.randomUUID(),
          timestamp: Date.now(),
          command,
          verdict: 'REJECTED',
          reason,
          ikError
        });
        useStore.getState().setError(`Command Rejected: Target unreachable / IK Failed`);
        return 'REJECTED';
      }
    } else if (command.type === 'jog' && command.delta) {
      const currentJoints = useStore.getState().joints;
      const currentPose = getEndEffectorPose(currentJoints);
      const targetPos = {
        x: currentPose.x + (command.delta.x || 0),
        y: currentPose.y + (command.delta.y || 0),
        z: currentPose.z + (command.delta.z || 0)
      };
      
      let targetQuatArray: [number, number, number, number] | undefined = undefined;
      
      if ((command.delta.rx || command.delta.ry || command.delta.rz) && currentPose.quat) {
         const q = currentPose.quat.clone();
         const euler = new THREE.Euler(command.delta.rx || 0, command.delta.ry || 0, command.delta.rz || 0, 'XYZ');
         const dq = new THREE.Quaternion().setFromEuler(euler);
         q.multiply(dq);
         targetQuatArray = [q.x, q.y, q.z, q.w];
      }

      const target = { ...targetPos, quat: targetQuatArray };
      const ikResult = solveIK(target, currentJoints);
      proposedJoints = ikResult.jointAngles;
      ikError = ikResult.error;
    } else if (command.type === 'jog' && command.jointIndex !== undefined && command.deltaRad !== undefined) {
      const currentJoints = useStore.getState().joints;
      const keys: (keyof JointState)[] = ['joint_1', 'joint_2', 'joint_3', 'joint_4', 'joint_5', 'joint_6'];
      const jointName = keys[command.jointIndex];
      proposedJoints = { ...currentJoints, [jointName]: currentJoints[jointName] + command.deltaRad };
    } else if (command.type === 'rotate_joint' && command.jointIndex !== undefined && command.absRad !== undefined) {
      const currentJoints = useStore.getState().joints;
      const keys: (keyof JointState)[] = ['joint_1', 'joint_2', 'joint_3', 'joint_4', 'joint_5', 'joint_6'];
      const jointName = keys[command.jointIndex];
      proposedJoints = { ...currentJoints, [jointName]: command.absRad };
    } else {
      auditLog.append({
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        command,
        verdict: 'REJECTED',
        reason: 'UNSUPPORTED_COMMAND_TYPE'
      });
      return 'REJECTED';
    }

    const validationReport = validate(command, proposedJoints);
    if (!validationReport.pass) {
      auditLog.append({
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        command,
        verdict: 'REJECTED',
        reason: validationReport.reason,
        ikError
      });
      return 'REJECTED';
    }

    // 4. Executor
    if (fsm.getState() !== 'AUTONOMOUS_SEQUENCE') {
      fsm.transitionTo((command.type === 'jog' || (command.type === 'setJoint' && command.joint?.delta !== undefined)) ? 'JOGGING' : 'EXECUTE');
    }
    
    await execute(proposedJoints);

    if (fsm.getState() === 'STOP') {
      auditLog.append({ id: crypto.randomUUID(), timestamp: Date.now(), command, verdict: 'REJECTED', reason: 'INTERRUPTED_BY_ESTOP', ikError });
      return 'REJECTED';
    }

    auditLog.append({
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      command,
      verdict: 'ACCEPTED',
      ikError
    });
    return 'ACCEPTED';
  }

  public async dispatch(command: ArmCommand): Promise<string> {
    return this.submit(command);
  }
}

export const commandBus = new CommandBus();
