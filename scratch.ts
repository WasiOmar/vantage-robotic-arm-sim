import { solveIK } from './src/kinematics/index.js';
import { HOME_JOINTS } from './src/store.js';

const target = { x: 0.5, y: 0.25, z: 0.1, approach: [0, 0, -1] };
const result = solveIK(target, HOME_JOINTS);
console.log("IK Result:", result);
