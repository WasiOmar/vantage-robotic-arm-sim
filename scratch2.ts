import { solveIK, getEndEffectorPose } from './src/kinematics/index.js';
import { HOME_JOINTS } from './src/store.js';

const target = { x: 0.5, y: 0.25, z: 0.1, approach: [0, 0, -1] as [number, number, number] };
const result = solveIK(target, HOME_JOINTS);
console.log("IK Result error:", result.error);
console.log("FK at result:", getEndEffectorPose(result.jointAngles));
