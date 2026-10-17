import { solveIK, getStylusPose } from './src/kinematics/ikSolver.ts';
import { HOME_JOINTS } from './src/store.ts';
import * as THREE from 'three';

const homePose = getStylusPose(HOME_JOINTS);
console.log("Home Pose:", homePose);

// Try to solve IK for a position very close to home
const targetPos = new THREE.Vector3(homePose.x + 0.01, homePose.y, homePose.z - 0.01);
const targetDir = new THREE.Vector3(homePose.nx, homePose.ny, homePose.nz);
const limits = {};

const result = solveIK(targetPos, targetDir, HOME_JOINTS, limits);
console.log("IK Result Error:", result.error);
console.log("IK Result Converged:", result.converged);
console.log("IK Result Iterations:", result.iterations);

