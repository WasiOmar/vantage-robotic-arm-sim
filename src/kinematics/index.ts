import type { JointState } from '../types';

export interface IKResult {
  jointAngles: JointState;
  converged: boolean;
  error: number;
  iterations: number;
}

export interface CartesianPose {
  x: number;
  y: number;
  z: number;
  nx: number;
  ny: number;
  nz: number;
  quat?: THREE.Quaternion;
}

export interface JointLimit {
  min: number;
  max: number;
  velocity?: number;
  effort?: number;
}

import { solveIK as realSolveIK, getStylusPose } from './ikSolver';
import * as THREE from 'three';

// Stub implementation for URDF parsing.
// In reality, this would fetch '6_dof_arm.urdf', parse the XML, and extract limits.
export function parseUrdfLimits(): Record<string, JointLimit> {
  return {
    joint_1: { min: -3.1416, max: 3.1416, velocity: 2.5 },
    joint_2: { min: -1.5708, max: 1.5708, velocity: 2.5 },
    joint_3: { min: -2.6180, max: 2.6180, velocity: 3.0 },
    joint_4: { min: -3.1416, max: 3.1416, velocity: 3.5 },
    joint_5: { min: -2.0944, max: 2.0944, velocity: 4.0 },
    joint_6: { min: -3.1416, max: 3.1416, velocity: 4.5 },
  };
}

export function solveIK(
  target: { x: number; y: number; z: number; approach?: [number, number, number]; quat?: [number, number, number, number] },
  currentJoints: JointState
): IKResult {
  const targetPos = new THREE.Vector3(target.x, target.y, target.z);
  const approach = target.approach || [0, 0, -1];
  const targetDir = new THREE.Vector3(approach[0], approach[1], approach[2]).normalize();
  let targetQuat = undefined;
  if (target.quat) {
    targetQuat = new THREE.Quaternion(target.quat[0], target.quat[1], target.quat[2], target.quat[3]);
  }
  const limits = parseUrdfLimits();

  const result = realSolveIK(targetPos, targetDir, currentJoints, limits, 80, 0.0001, targetQuat);
  return {
    jointAngles: result.joints,
    converged: result.converged,
    error: result.error,
    iterations: result.iterations
  };
}

export function getEndEffectorPose(jointAngles: JointState): CartesianPose {
  return getStylusPose(jointAngles);
}
