import { solveIK as solveIKInternal } from './src/kinematics/ikSolver.js';
import * as THREE from 'three';

const targetPos = new THREE.Vector3(0.5, 0.25, 0.1);
const targetDir = new THREE.Vector3(0, 0, -1);
const initialJoints = { joint_1: 0, joint_2: 0, joint_3: 0, joint_4: 0, joint_5: 0, joint_6: 0 };

const limits = {
  joint_1: { min: -3.1416, max: 3.1416 },
  joint_2: { min: -1.5708, max: 1.5708 },
  joint_3: { min: -2.6180, max: 2.6180 },
  joint_4: { min: -3.1416, max: 3.1416 },
  joint_5: { min: -2.0944, max: 2.0944 }, 
  joint_6: { min: -3.1416, max: 3.1416 },
};

const result = solveIKInternal(targetPos, targetDir, initialJoints, limits, 80, 0.0001);
console.log("Error:", result.error);
