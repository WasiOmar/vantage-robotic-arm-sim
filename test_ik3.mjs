import * as THREE from 'three';

// Manually implement getStylusPose to avoid imports
export function getStylusPose(joints) {
  const T_base = new THREE.Matrix4().identity();
  const T_j1 = new THREE.Matrix4().makeTranslation(0, 0, 0.060).multiply(new THREE.Matrix4().makeRotationZ(joints.joint_1));
  const T_j2 = T_j1.clone().multiply(new THREE.Matrix4().makeTranslation(0, 0, 0.250).multiply(new THREE.Matrix4().makeRotationY(joints.joint_2)));
  const T_j3 = T_j2.clone().multiply(new THREE.Matrix4().makeTranslation(0, 0, 0.250).multiply(new THREE.Matrix4().makeRotationY(joints.joint_3)));
  const T_j4 = T_j3.clone().multiply(new THREE.Matrix4().makeTranslation(0, 0, 0.250).multiply(new THREE.Matrix4().makeRotationZ(joints.joint_4)));
  const T_j5 = T_j4.clone().multiply(new THREE.Matrix4().makeTranslation(0, 0, 0.150).multiply(new THREE.Matrix4().makeRotationY(joints.joint_5)));
  const T_j6 = T_j5.clone().multiply(new THREE.Matrix4().makeTranslation(0, 0, 0.250).multiply(new THREE.Matrix4().makeRotationZ(joints.joint_6)));
  const T_tip = T_j6.clone().multiply(new THREE.Matrix4().makeTranslation(0, 0, 0.287));

  const position = new THREE.Vector3().setFromMatrixPosition(T_tip);
  const zAxis = new THREE.Vector3(T_tip.elements[8], T_tip.elements[9], T_tip.elements[10]).normalize();

  return {
    x: position.x,
    y: position.y,
    z: position.z,
    nx: zAxis.x,
    ny: zAxis.y,
    nz: zAxis.z,
  };
}

const HOME = { joint_1: 0, joint_2: 0, joint_3: 0, joint_4: 0, joint_5: 0, joint_6: 0 };
console.log(getStylusPose(HOME));
