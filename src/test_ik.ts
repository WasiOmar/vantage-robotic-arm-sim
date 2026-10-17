import { solveIK } from './kinematics/index.ts';
const currentJoints = { joint_1: 0, joint_2: 0, joint_3: 0, joint_4: 0, joint_5: 0, joint_6: 0 };
const result = solveIK({ x: 0.2, y: 0, z: 0.3 }, currentJoints);
console.log("Result:", result);
