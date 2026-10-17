import { useEffect, useRef } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import RobotSimulator from './components/RobotSimulator';
import CommandCenter from './components/CommandCenter';


import AuditLog from './components/AuditLog';
import TelemetryDashboard from './components/TelemetryDashboard';
import StatusBar from './components/StatusBar';
import { useStore } from './store';
import { initKeyboardTrigger } from './triggers/keyboard';
import { initMouseTrigger } from './triggers/mouse';
import './index.css';

function App() {
  const { controlMode, cameraMode } = useStore();
  const canvasContainerRef = useRef<HTMLDivElement>(null);

  // Initialize Keyboard Trigger
  useEffect(() => {
    if (controlMode === 'KEYBOARD') {
      const cleanup = initKeyboardTrigger();
      return cleanup;
    }
  }, [controlMode]);

  // Initialize Mouse Trigger
  useEffect(() => {
    if (controlMode === 'MOUSE' && canvasContainerRef.current) {
      const canvas = canvasContainerRef.current.querySelector('canvas');
      if (canvas) {
        const cleanup = initMouseTrigger(canvas);
        return cleanup;
      }
    }
  }, [controlMode, cameraMode]); // Re-run if cameraMode changes so the trigger can attach/detach correctly or handle the state. Actually the trigger reads the store dynamically, but the event listeners might need to be on the canvas which doesn't change.

  return (
    <div style={{ width: '100vw', height: '100vh', overflow: 'hidden', background: '#0a0a0a', position: 'relative', display: 'flex', flexDirection: 'column' }}>
      <StatusBar />
      <div style={{ flex: 1, position: 'relative', marginTop: '60px', display: 'flex' }}>

        {/* 3D Background Canvas */}
        <div ref={canvasContainerRef} style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', zIndex: 0 }}>
          <Canvas camera={{ position: [1.2, 1.0, 1.2], fov: 55 }}>
            <ambientLight intensity={0.5} />
            <directionalLight position={[2, 4, 3]} intensity={1} castShadow />
            <RobotSimulator />
            <OrbitControls enabled={controlMode !== 'MOUSE' || cameraMode} />
          </Canvas>
        </div>

        {/* UI Overlay */}
        <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none', display: 'flex', padding: '1rem', boxSizing: 'border-box', zIndex: 10 }}>

          {/* Left Sidebar Stack */}
          <div style={{ pointerEvents: 'auto', display: 'flex', flexDirection: 'column', gap: '1rem', height: '100%', width: '380px', overflowY: 'auto', paddingRight: '0.5rem' }}>
            <CommandCenter />

            <TelemetryDashboard />
            <div style={{ flex: 1, minHeight: 0 }}>
              <AuditLog />
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}

export default App;
