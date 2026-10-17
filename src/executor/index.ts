import type { JointState } from '../types';
import { useStore } from '../store';

import { fsm } from '../fsm';

// This module is the ONLY place allowed to mutate the live joint state of the arm.

let currentAnimation: number | null = null;

export function execute(validatedJointAngles: JointState): Promise<void> {
  return new Promise<void>((resolve) => {
    const store = useStore.getState();
    const startJoints = { ...store.joints };

    if (currentAnimation !== null) {
      cancelAnimationFrame(currentAnimation);
    }

    const limits = store.urdfLimits;
    const isAuto = fsm.getState() === 'AUTONOMOUS_SEQUENCE' || fsm.getState() === 'AUTONOMOUS_PAUSED';

    const isJogging = fsm.getState() === 'JOGGING';
    let durationSeconds = isJogging ? 0.1 : 0.5;
    const keys: (keyof JointState)[] = ['joint_1', 'joint_2', 'joint_3', 'joint_4', 'joint_5', 'joint_6'];

    if (isAuto) {
      const rpm = store.rpm > 0 ? store.rpm : 140;
      const radPerSec = (rpm * 2 * Math.PI) / 60;
      for (const key of keys) {
        const val = validatedJointAngles[key];
        if (val !== undefined) {
          const reqTime = Math.abs(val - startJoints[key]) / radPerSec;
          if (reqTime > durationSeconds) {
            durationSeconds = reqTime + 0.05;
          }
        }
      }
    } else {
      for (const key of keys) {
        const val = validatedJointAngles[key];
        const limit = limits[key];
        if (val !== undefined && limit && limit.velocity) {
          const reqTime = Math.abs(val - startJoints[key]) / limit.velocity;
          if (reqTime > durationSeconds) {
            durationSeconds = reqTime + 0.05;
          }
        }
      }
    }

    const duration = durationSeconds * 1000;
    let startTime = performance.now();
    let accumulatedPauseTime = 0;
    let lastPauseTime: number | null = null;

    function animate(time: number) {
      if (fsm.getState() === 'STOP' || fsm.getState() === 'ERROR' || fsm.getState() === 'REST') {
        currentAnimation = null;
        resolve(); // Aborted — resolve so the caller can continue
        return;
      }

      if (fsm.getState() === 'AUTONOMOUS_PAUSED') {
        if (lastPauseTime === null) {
          lastPauseTime = time;
        }
        currentAnimation = requestAnimationFrame(animate);
        return; // Freeze the animation
      }

      if (lastPauseTime !== null) {
        accumulatedPauseTime += (time - lastPauseTime);
        lastPauseTime = null;
      }

      const elapsed = time - startTime - accumulatedPauseTime;
      const t = Math.min(elapsed / duration, 1.0);

      // Simple ease-in-out or linear lerp (linear for jogging to prevent ease-in stalling)
      const easeT = isJogging ? t : (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t);

      const newJoints = { ...startJoints };
      const jointKeys: (keyof JointState)[] = ['joint_1', 'joint_2', 'joint_3', 'joint_4', 'joint_5', 'joint_6'];

      for (const key of jointKeys) {
        if (validatedJointAngles[key] !== undefined) {
          newJoints[key] = startJoints[key] + (validatedJointAngles[key] - startJoints[key]) * easeT;
        }
      }

      useStore.getState().setJoints(newJoints);

      if (t < 1.0) {
        currentAnimation = requestAnimationFrame(animate);
      } else {
        currentAnimation = null;
        // Movement complete — transition back to REST then resolve
        if (fsm.getState() === 'EXECUTE' || fsm.getState() === 'JOGGING') {
          fsm.transitionTo('REST');
        }
        resolve();
      }
    }

    currentAnimation = requestAnimationFrame(animate);
  });
}
