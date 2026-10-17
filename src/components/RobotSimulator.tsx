import { useEffect, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html, RoundedBox, Text } from '@react-three/drei';
import URDFLoader from 'urdf-loader';
import * as THREE from 'three';
import { useStore } from '../store';
import type { UrdfLimits } from '../types';

const RobotSimulator = () => {
  const joints = useStore((state) => state.joints);
  const activeJoint = useStore((state) => state.activeJoint);
  const activeSequenceDigit = useStore((state) => state.activeSequenceDigit);
  const setUrdfLimits = useStore((state) => state.setUrdfLimits);
  const [robot, setRobot] = useState<any>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [keys, setKeys] = useState<{ id: string; pos: [number, number, number] }[]>([]);

  const showGrid = useStore((state) => state.showGrid);

  useEffect(() => {
    fetch('/key.config.json')
      .then(res => res.json())
      .then(data => {
        const keyArray = Object.entries(data.keys).map(([id, pos]: [string, any]) => ({
          id,
          pos: [pos.x, pos.y, pos.z] as [number, number, number]
        }));
        setKeys(keyArray);
      })
      .catch(err => console.error('Failed to load key config', err));
  }, []);

  useEffect(() => {
    try {
      const loader = new URDFLoader();
      loader.load('/6_dof_arm.urdf', (urdf: any) => {
        try {
          const getJointIndex = (name: string) => {
            if (name === 'base_link' || name === 'link_1') return 1;
            if (name === 'link_2') return 2;
            if (name === 'link_3') return 3;
            if (name === 'link_4') return 4;
            if (name === 'link_5') return 5;
            if (name === 'link_6') return 6;
            return -1;
          };

          urdf.traverse((child: any) => {
            if (child.isMesh) {
              const isJointHub = child.material?.name === 'amber';
              child.userData.isJointHub = isJointHub;
              
              if (isJointHub) {
                let p = child.parent;
                while (p && !p.name?.includes('link')) {
                  p = p.parent;
                }
                child.userData.jointIndex = p ? getJointIndex(p.name) : -1;
              }

              const color = isJointHub ? 0xff8c00 : 0x222222;
              const metalness = isJointHub ? 0.3 : 0.6;
              const roughness = isJointHub ? 0.4 : 0.2;
              child.material = new THREE.MeshStandardMaterial({ color, roughness, metalness });
              child.castShadow = true;
              child.receiveShadow = true;
            }
          });
          // Ensure the root base is correctly oriented
          urdf.rotation.x = -Math.PI / 2;
          
          // Parse limits for Layer 2 Safety Gate
          const limits: UrdfLimits = {};
          for (const jointName in urdf.joints) {
             const joint = urdf.joints[jointName];
             if (joint.limit && jointName !== 'stylus_pitch') {
                limits[jointName] = { 
                  min: joint.limit.lower, 
                  max: joint.limit.upper, 
                  effort: joint.limit.effort, 
                  velocity: joint.limit.velocity 
                };
             }
          }
          setUrdfLimits(limits);
          setRobot(urdf);
        } catch (err: any) {
           setErrorMsg('URDF parsing callback error: ' + err.message);
        }
      });
    } catch (e: any) {
      setErrorMsg('URDFLoader init error: ' + e.message);
    }
  }, [setUrdfLimits]);

  useFrame(({ clock }) => {
    if (robot) {
      if (robot.joints['joint_1']) robot.joints['joint_1'].setJointValue(joints.joint_1);
      if (robot.joints['joint_2']) robot.joints['joint_2'].setJointValue(joints.joint_2);
      if (robot.joints['joint_3']) robot.joints['joint_3'].setJointValue(joints.joint_3);
      if (robot.joints['joint_4']) robot.joints['joint_4'].setJointValue(joints.joint_4);
      if (robot.joints['joint_5']) robot.joints['joint_5'].setJointValue(joints.joint_5);
      if (robot.joints['joint_6']) robot.joints['joint_6'].setJointValue(joints.joint_6);

      const time = clock.elapsedTime;
      const pulseIntensity = Math.sin(time * 5) * 0.5 + 0.5;
      
      robot.traverse((child: any) => {
        if (child.isMesh && child.userData.isJointHub) {
          if (child.userData.jointIndex === activeJoint) {
            child.material.emissive.setHex(0xccff00);
            child.material.emissiveIntensity = pulseIntensity;
          } else {
            child.material.emissiveIntensity = 0;
          }
        }
      });
    }
  });

  useEffect(() => {
    if (!robot) return;
    robot.traverse((child: any) => {
      if (child.isMesh && child.userData.isJointHub) {
        child.material.color.setHex(0xff8c00); // base industrial orange
      }
    });
  }, [robot]);

  if (errorMsg) {
     return (
       <Html center>
         <div style={{ color: 'red', background: 'rgba(255,255,255,0.8)', padding: '10px' }}>
           {errorMsg}
         </div>
       </Html>
     );
  }

  return (
    <>
      {showGrid && <gridHelper args={[5, 50, 0xd2b48c, 0xebccaa]} />}
      {robot && <primitive object={robot} />}
      
      {/* Render the keypad */}
      <group rotation={[-Math.PI / 2, 0, 0]}>
        {keys.map(key => {
          const isActive = key.id === activeSequenceDigit;
          const zOffset = isActive ? -0.015 : 0;
          return (
            <group key={key.id} position={[key.pos[0], key.pos[1], key.pos[2] + zOffset]}>
              <RoundedBox args={[0.075, 0.075, 0.02]} radius={0.01} smoothness={4} castShadow receiveShadow>
                <meshStandardMaterial 
                  color={isActive ? "#ffffcc" : "#ffffff"} 
                  emissive={isActive ? "#ffcc00" : "#000000"}
                  emissiveIntensity={isActive ? 0.3 : 0}
                  roughness={0.9} 
                  metalness={0.8} 
                />
              </RoundedBox>
              
              <Text 
                position={[0, 0, 0.012]} 
                fontSize={0.04} 
                color="#000000" 
                anchorX="center" 
                anchorY="middle"
              >
                {key.id}
              </Text>
              
              {isActive && (
                <pointLight position={[0, 0, 0.05]} color="#ff8c00" intensity={0.8} distance={0.5} />
              )}
            </group>
          );
        })}
      </group>
    </>
  );
};

export default RobotSimulator;
