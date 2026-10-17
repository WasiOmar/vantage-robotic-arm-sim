import { solveIK } from './src/kinematics/ikSolver';
import * as THREE from 'three';
import { HOME_JOINTS } from './src/store';

const targetPos = new THREE.Vector3(0.1, 0.1, 0.2);
const targetDir = new THREE.Vector3(0, 0, -1);
const limits = {};

const result = solveIK(targetPos, targetDir, HOME_JOINTS, limits);
console.log("IK Result:", result);
