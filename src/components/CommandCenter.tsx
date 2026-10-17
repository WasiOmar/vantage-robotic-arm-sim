import React, { useState, useEffect, useRef } from 'react';
import { useStore } from '../store';

import { runPinSequence, type SequenceStatus } from '../triggers/autonomous';
import { fsm } from '../fsm';
import AgentPanel from '../agent/AgentPanel';
import VoiceControl from '../triggers/voice/VoiceControl';

import { NativeJoystick } from './NativeJoystick';
import { commandBus } from '../bus/commandBus';

const JoystickControls = () => {
  const { rpm } = useStore();
  const lastLeftCycleTime = useRef<number>(0);
  const currentDirectionRef = useRef<number>(0);
  const currentSpeedYRef = useRef<number>(0);

  // Left Stick: Toggle Active Joint (Y axis)
  const handleLeftMove = (_x: number, y: number) => {
    const state = useStore.getState();
    if (state.isEStop || state.mode === 'ERROR' || state.mode === 'EXECUTE' || state.controlMode !== 'JOYSTICK') return;

    const threshold = 0.6;
    const now = Date.now();
    
    // y > 0 is up, y < 0 is down
    if (Math.abs(y) > threshold && now - lastLeftCycleTime.current > 300) {
      if (y > threshold) {
        // Up -> Decrement active joint
        let next = state.activeJoint - 1;
        if (next < 1) next = 6;
        state.setActiveJoint(next);
        lastLeftCycleTime.current = now;
      } else if (y < -threshold) {
        // Down -> Increment active joint
        let next = state.activeJoint + 1;
        if (next > 6) next = 1;
        state.setActiveJoint(next);
        lastLeftCycleTime.current = now;
      }
    }
  };

  const handleLeftEnd = () => {};

  // Right Stick: Rotate Active Joint (X axis)
  const handleRightMove = (x: number, _y: number) => {
    const state = useStore.getState();
    if (state.isEStop || state.mode === 'ERROR' || state.mode === 'EXECUTE' || state.controlMode !== 'JOYSTICK') return;

    const threshold = 0.2;
    if (x > threshold) {
      currentDirectionRef.current = 1;
    } else if (x < -threshold) {
      currentDirectionRef.current = -1;
    } else {
      currentDirectionRef.current = 0;
    }
  };

  const handleRightEnd = () => {
    currentDirectionRef.current = 0;
  };

  // Speed Stick: Adjust RPM (Y axis)
  const handleSpeedMove = (_x: number, y: number) => {
    currentSpeedYRef.current = y;
  };

  const handleSpeedEnd = () => {
    currentSpeedYRef.current = 0;
  };

  // 10Hz stream for Joint Rotation commands
  useEffect(() => {
    const interval = setInterval(() => {
      if (currentDirectionRef.current !== 0) {
        const state = useStore.getState();
        if (state.isEStop || state.mode === 'ERROR' || state.mode === 'EXECUTE' || state.controlMode !== 'JOYSTICK') return;

        const { activeJoint, stepSize } = state;
        commandBus.submit({
          id: crypto.randomUUID(),
          timestamp: Date.now(),
          source: 'joystick',
          type: 'setJoint',
          joint: { name: `joint_${activeJoint}`, delta: currentDirectionRef.current * stepSize }
        });
      }
    }, 100);

    return () => clearInterval(interval);
  }, []);

  // 20Hz stream for continuous RPM adjustment
  useEffect(() => {
    const interval = setInterval(() => {
      if (currentSpeedYRef.current !== 0) {
        const state = useStore.getState();
        const deltaRpm = currentSpeedYRef.current * 4; // Scale speed of change
        const newRpm = Math.max(0, Math.min(255, state.rpm + deltaRpm));
        state.setRpm(newRpm);
      }
    }, 50);

    return () => clearInterval(interval);
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', alignItems: 'center' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
        <h3 style={{ margin: 0, fontSize: '0.9rem', color: '#eee' }}>Tri-Stick Control</h3>
        <span style={{ fontSize: '0.8rem', fontWeight: 'bold', color: '#ff3366' }}>{Math.round(rpm)} RPM</span>
      </div>
      
      <div style={{ display: 'flex', gap: '2rem', width: '100%', justifyContent: 'center' }}>
        <NativeJoystick 
          color="#9933ff"
          label="Toggle Joint (Y)"
          lockX={true}
          onMove={handleLeftMove}
          onEnd={handleLeftEnd}
        />
        <NativeJoystick 
          color="#00ccff"
          label="Rotate Servo (X)"
          lockY={true}
          onMove={handleRightMove}
          onEnd={handleRightEnd}
        />
      </div>

      <div style={{ width: '100%', display: 'flex', justifyContent: 'center' }}>
        <NativeJoystick 
          color="#ff3366"
          label="Speed Control (Y)"
          lockX={true}
          onMove={handleSpeedMove}
          onEnd={handleSpeedEnd}
        />
      </div>
    </div>
  );
};

export const CommandCenter: React.FC = () => {
  const { mode, controlMode, setControlMode, addLog, cameraMode, setCameraMode, rpm, setRpm } = useStore();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  

  // Auto State
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authPin, setAuthPin] = useState('');
  const [pin, setPin] = useState('');
  const [seqStatus, setSeqStatus] = useState<SequenceStatus | null>(null);
  const [seqError, setSeqError] = useState('');
  const [isPaused, setIsPaused] = useState(false);

  // Coordinates State
  const [coordX, setCoordX] = useState('0.3');
  const [coordY, setCoordY] = useState('0.0');
  const [coordZ, setCoordZ] = useState('0.15');
  const [coordError, setCoordError] = useState('');

  const isDisabled = mode === 'STOP' || mode === 'ERROR' || mode === 'EXECUTE';

  const handleRunPin = () => {
    if (pin.length !== 6) return;
    setSeqError('');
    
    if (/[7890]/.test(pin)) {
      setSeqError('Error: Physical keypad only contains keys 1-6');
      return;
    }

    setIsPaused(false);
    addLog({ source: 'autonomous', type: 'info', message: `Starting autonomous sequence: ${pin}` });
    
    runPinSequence(pin, (status) => {
      setSeqStatus({...status});
      
      const activeDigit = status.status === 'EXECUTING' && status.activeDigitIndex >= 0 && (status.phase === 'descending' || status.phase === 'pressed')
        ? status.pin[status.activeDigitIndex] 
        : null;
      useStore.getState().setActiveSequenceDigit(activeDigit);

      if (status.status === 'SUCCESS' || status.status === 'FAULT' || status.status === 'IDLE') {
        if (status.status === 'SUCCESS') addLog({ source: 'autonomous', type: 'success', message: 'PIN sequence completed successfully' });
        useStore.getState().setActiveSequenceDigit(null);
      }
    });
  };

  const handleMoveToCoords = async () => {
    setCoordError('');
    const x = parseFloat(coordX);
    const y = parseFloat(coordY);
    const z = parseFloat(coordZ);

    if (isNaN(x) || isNaN(y) || isNaN(z)) {
      setCoordError('Please enter valid numerical coordinates');
      return;
    }

    addLog({ source: 'autonomous', type: 'info', message: `Moving stylus to coordinates X: ${x.toFixed(3)}, Y: ${y.toFixed(3)}, Z: ${z.toFixed(3)}` });
    
    const result = await commandBus.submit({
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      source: 'autonomous',
      type: 'moveTo',
      target: { x, y, z }
    });

    if (result === 'REJECTED') {
      setCoordError('Movement rejected (safety violation or out of reach)');
    }
  };

  return (
    <div className="glass-panel" style={{ width: '100%', display: 'flex', flexDirection: 'column', zIndex: 10, boxSizing: 'border-box' }}>
      
      {/* Header with Hamburger */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
        <h2 style={{ margin: 0, fontSize: '1.1rem', color: '#eee', display: 'flex', alignItems: 'center', gap: '0.5rem', lineHeight: 1 }}>
          {controlMode === 'JOYSTICK' && <>Joystick</>}
          {controlMode === 'MOUSE' && <>Mouse Control</>}
          {controlMode === 'KEYBOARD' && <>Keyboard</>}
          {controlMode === 'VOICE' && <>Voice Control</>}
          {controlMode === 'PIN' && <>Auto / PIN</>}
          {controlMode === 'AGENTIC' && <>Agentic</>}
        </h2>
        <button onClick={() => setIsMenuOpen(!isMenuOpen)} style={{ width: '32px', height: '32px', padding: 0, background: 'transparent', border: 'none', fontWeight: 'bold', fontSize: '1.4rem', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}>
          ☰
        </button>
      </div>

      {isMenuOpen && (
        <div style={{ display: 'flex', flexDirection: 'column', background: 'rgba(20,20,20,0.95)', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
          <button 
            onClick={() => { setControlMode('JOYSTICK'); setIsMenuOpen(false); }}
            style={{ padding: '1rem', background: controlMode === 'JOYSTICK' ? '#111' : 'transparent', border: 'none', color: controlMode === 'JOYSTICK' ? '#FAF9F6' : '#555', textAlign: 'left', borderRadius: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}
          >Joystick</button>
          
          <button 
            onClick={() => { setControlMode('MOUSE'); setIsMenuOpen(false); }}
            style={{ padding: '1rem', background: controlMode === 'MOUSE' ? '#111' : 'transparent', border: 'none', color: controlMode === 'MOUSE' ? '#FAF9F6' : '#555', textAlign: 'left', borderRadius: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}
          >Mouse Control</button>
          
          <button 
            onClick={() => { setControlMode('KEYBOARD'); setIsMenuOpen(false); }}
            style={{ padding: '1rem', background: controlMode === 'KEYBOARD' ? '#111' : 'transparent', border: 'none', color: controlMode === 'KEYBOARD' ? '#FAF9F6' : '#555', textAlign: 'left', borderRadius: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}
          >Keyboard</button>
          
          <button 
            onClick={() => { setControlMode('VOICE'); setIsMenuOpen(false); }}
            style={{ padding: '1rem', background: controlMode === 'VOICE' ? '#111' : 'transparent', border: 'none', color: controlMode === 'VOICE' ? '#FAF9F6' : '#555', textAlign: 'left', borderRadius: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}
          >Voice Control</button>
          
          <button 
            onClick={() => { setControlMode('PIN'); setIsMenuOpen(false); }}
            style={{ padding: '1rem', background: controlMode === 'PIN' ? '#111' : 'transparent', border: 'none', color: controlMode === 'PIN' ? '#FAF9F6' : '#555', textAlign: 'left', borderRadius: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}
          >Auto / PIN</button>
          
          <button 
            onClick={() => { setControlMode('AGENTIC'); setIsMenuOpen(false); }}
            style={{ padding: '1rem', background: controlMode === 'AGENTIC' ? '#111' : 'transparent', border: 'none', color: controlMode === 'AGENTIC' ? '#FAF9F6' : '#555', textAlign: 'left', borderRadius: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}
          >Agentic</button>
        </div>
      )}

      <div style={{ padding: '0.75rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem', opacity: isDisabled ? 0.5 : 1, pointerEvents: isDisabled ? 'none' : 'auto' }}>
        
        {/* JOYSTICK MODE */}
        {controlMode === 'JOYSTICK' && (
          <JoystickControls />
        )}

        {/* MOUSE MODE */}
        {controlMode === 'MOUSE' && (
          <div style={{ textAlign: 'center', padding: '0.5rem 0', color: '#555' }}>

            <p style={{ margin: 0, fontWeight: 'bold' }}>Mouse Control Active</p>
            <p style={{ fontSize: '0.8rem', marginTop: '0.5rem' }}>
              {!cameraMode ? 'Scroll to change joints. Left/Right click to rotate.' : 'Pan Mode active. OrbitControls enabled.'}
            </p>
            
            {!cameraMode && (
              <div style={{ marginTop: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                <label style={{ fontSize: '0.8rem', fontWeight: 'bold' }}>Speed (RPM):</label>
                <input type="number" min="0" max="255" value={Math.round(rpm)} onChange={(e) => setRpm(parseFloat(e.target.value) || 0)} style={{ width: '80px', padding: '0.25rem', borderRadius: '4px', border: '1px solid #ccc', textAlign: 'center' }} />
              </div>
            )}

            <button 
              onClick={() => setCameraMode(!cameraMode)}
              style={{
                marginTop: '1rem',
                padding: '0.5rem 1rem',
                background: cameraMode ? '#cc0000' : '#ff8c00',
                color: '#fff',
                border: 'none',
                borderRadius: '4px',
                fontWeight: 'bold',
                cursor: 'pointer'
              }}
            >
              {cameraMode ? 'Disable Pan Mode (Enable Joint Control)' : 'Enable Pan Mode (Orbit Camera)'}
            </button>
          </div>
        )}

        {/* Keyboard MODE */}
        {controlMode === 'KEYBOARD' && (
          <div style={{ textAlign: 'center', padding: '0.5rem 0', color: '#555' }}>

            <p style={{ margin: 0, fontWeight: 'bold' }}>Keyboard Control Active</p>
            <p style={{ fontSize: '0.8rem', marginTop: '0.5rem' }}>Press <b>1-6</b> to select a joint.<br/>Press <b>A / D</b> to rotate.</p>
            
            <div style={{ marginTop: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
              <label style={{ fontSize: '0.8rem', fontWeight: 'bold' }}>Speed (RPM):</label>
              <input type="number" min="0" max="255" value={Math.round(rpm)} onChange={(e) => setRpm(parseFloat(e.target.value) || 0)} style={{ width: '80px', padding: '0.25rem', borderRadius: '4px', border: '1px solid #ccc', textAlign: 'center' }} />
            </div>
          </div>
        )}

        {/* AUTO / PIN MODE */}
        {controlMode === 'PIN' && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, minHeight: '200px' }}>
            {!isAuthenticated ? (
              <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <h3 style={{ margin: '0 0 1rem 0', fontSize: '1rem', color: '#eee' }}>System Locked</h3>
                <p style={{ fontSize: '0.8rem', color: '#aaa', marginBottom: '1rem' }}>Enter secret PIN to unlock physical command execution.</p>
                <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center', marginBottom: '1rem' }}>
                  <input 
                    type="password" 
                    value={authPin} 
                    onChange={e => setAuthPin(e.target.value)} 
                    placeholder="Secret PIN"
                    style={{ padding: '0.5rem', borderRadius: '4px', border: '1px solid #ccc', textAlign: 'center', width: '150px' }}
                  />
                </div>
                <button 
                  onClick={() => {
                    if (authPin === (import.meta.env.VITE_SECRET_PIN || '117117')) {
                      setIsAuthenticated(true);
                      setAuthPin('');
                    } else {
                      alert('Access Denied');
                    }
                  }}
                  className="btn-industrial"
                >
                  Authenticate
                </button>
              </div>
            ) : (
              <div style={{ width: '100%' }}>
                {/* Stylus Coordinates Input Section */}
                <div style={{ width: '100%', marginBottom: '1.5rem', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '1.5rem' }}>
                  <h4 style={{ margin: '0 0 0.75rem 0', fontSize: '0.85rem', color: '#ff8c00', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Stylus Coordinates (XYZ)
                  </h4>
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.75rem' }}>
                     <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
                       <label style={{ fontSize: '0.65rem', color: '#aaa', marginBottom: '0.25rem', textAlign: 'center' }}>X (meters)</label>
                       <input 
                         type="text" 
                         value={coordX} 
                         onChange={e => setCoordX(e.target.value)} 
                         style={{ padding: '0.4rem', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', color: '#fff', borderRadius: '4px', textAlign: 'center', fontSize: '0.85rem', width: '100%', boxSizing: 'border-box' }}
                       />
                     </div>
                     <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
                       <label style={{ fontSize: '0.65rem', color: '#aaa', marginBottom: '0.25rem', textAlign: 'center' }}>Y (meters)</label>
                       <input 
                         type="text" 
                         value={coordY} 
                         onChange={e => setCoordY(e.target.value)} 
                         style={{ padding: '0.4rem', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', color: '#fff', borderRadius: '4px', textAlign: 'center', fontSize: '0.85rem', width: '100%', boxSizing: 'border-box' }}
                       />
                     </div>
                     <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
                       <label style={{ fontSize: '0.65rem', color: '#aaa', marginBottom: '0.25rem', textAlign: 'center' }}>Z (meters)</label>
                       <input 
                         type="text" 
                         value={coordZ} 
                         onChange={e => setCoordZ(e.target.value)} 
                         style={{ padding: '0.4rem', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', color: '#fff', borderRadius: '4px', textAlign: 'center', fontSize: '0.85rem', width: '100%', boxSizing: 'border-box' }}
                       />
                     </div>
                     <button 
                       onClick={handleMoveToCoords}
                       disabled={isDisabled}
                       style={{
                         marginTop: '1.1rem',
                         padding: '0.45rem 1rem',
                         background: isDisabled ? '#666' : 'linear-gradient(135deg, #ff8c00, #ff6600)',
                         border: 'none',
                         color: '#fff',
                         borderRadius: '4px',
                         fontWeight: 'bold',
                         fontSize: '0.8rem',
                         cursor: isDisabled ? 'not-allowed' : 'pointer',
                         boxShadow: isDisabled ? 'none' : '0 4px 10px rgba(255, 140, 0, 0.3)',
                         height: '34px'
                       }}
                     >
                       Move
                     </button>
                  </div>
                  {coordError && (
                    <div style={{ color: '#ff4d4d', fontSize: '0.75rem', fontWeight: 'bold', textAlign: 'center' }}>
                      {coordError}
                    </div>
                  )}
                </div>

                <h3 style={{ margin: '0 0 1rem 0', fontSize: '0.9rem', color: '#eee', textAlign: 'center' }}>Execute Physical Sequence</h3>
                <p style={{ fontSize: '0.75rem', color: '#aaa', marginBottom: '1rem' }}>Enter a 6-digit sequence to press (keys 1-6 only).</p>

                {seqError && (
                  <div style={{ color: 'red', fontSize: '0.8rem', fontWeight: 'bold', marginBottom: '1rem', textAlign: 'center' }}>
                    {seqError}
                  </div>
                )}
                
                {seqStatus && seqStatus.status !== 'IDLE' && (
                  <div style={{ marginBottom: '1rem', background: seqStatus.status === 'FAULT' ? '#ffcccc' : (seqStatus.status === 'SUCCESS' ? '#ccffcc' : '#e6f7ff'), padding: '0.75rem', borderRadius: '8px', border: '1px solid #ccc', fontSize: '0.85rem' }}>
                    <div style={{ fontWeight: 'bold', marginBottom: '0.25rem' }}>
                      Status: <span style={{ color: seqStatus.status === 'FAULT' ? 'red' : (seqStatus.status === 'SUCCESS' ? 'green' : 'blue') }}>{seqStatus.status}</span>
                    </div>
                    {seqStatus.status === 'EXECUTING' && seqStatus.activeDigitIndex >= 0 && (
                      <>
                        <div>Active Digit: <b>{seqStatus.pin[seqStatus.activeDigitIndex]}</b> (Index {seqStatus.activeDigitIndex + 1}/6)</div>
                        <div>Phase: <b>{seqStatus.phase}</b></div>
                        
                        <div style={{ marginTop: '0.75rem', display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
                          <button 
                            onClick={() => {
                              if (isPaused) {
                                fsm.resume();
                                setIsPaused(false);
                              } else {
                                fsm.pause();
                                setIsPaused(true);
                              }
                            }} 
                            style={{ padding: '0.35rem 1rem', cursor: 'pointer', background: '#fff', border: '1px solid #ccc', borderRadius: '4px', fontWeight: 'bold' }}
                          >
                            {isPaused ? 'Play' : 'Pause'}
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                )}

              <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
                {[0, 1, 2, 3, 4, 5].map((index) => (
                  <input 
                    key={index}
                    id={`pin-input-${index}`}
                    type="text" 
                    maxLength={1} 
                    value={pin[index] || ''} 
                    onChange={(e) => {
                      const val = e.target.value.replace(/\D/g, '');
                      if (!val && e.target.value !== '') return;
                      const newPin = pin.split('');
                      newPin[index] = val;
                      setPin(newPin.join(''));
                      if (val && index < 5) {
                        document.getElementById(`pin-input-${index + 1}`)?.focus();
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Backspace' && !pin[index] && index > 0) {
                        document.getElementById(`pin-input-${index - 1}`)?.focus();
                      }
                    }}
                    disabled={seqStatus?.status === 'EXECUTING'}
                    style={{ width: '2.2rem', height: '3rem', background: 'rgba(255,255,255,0.8)', border: '1px solid #ccc', color: '#111', borderRadius: '8px', fontSize: '1.2rem', textAlign: 'center', fontWeight: 'bold' }}
                  />
                ))}
                <button 
                  onClick={handleRunPin} 
                  disabled={pin.length !== 6 || seqStatus?.status === 'EXECUTING'} 
                  style={{ 
                    marginLeft: '0.25rem', width: '3rem', height: '3rem', flexShrink: 0,
                    background: pin.length === 6 ? 'linear-gradient(135deg, #9933ff, #7326bf)' : '#ccc', 
                    border: 'none', color: '#fff', borderRadius: '50%', 
                    display: 'flex', alignItems: 'center', justifyContent: 'center', 
                    fontSize: '1.2rem', boxShadow: pin.length === 6 ? '0 4px 10px rgba(153, 51, 255, 0.3)' : 'none', 
                    cursor: pin.length === 6 ? 'pointer' : 'not-allowed'
                  }}
                >
                  ▶
                </button>
              </div>
              </div>
            )}
          </div>
        )}

        {/* VOICE MODE */}
        {controlMode === 'VOICE' && <VoiceControl />}

        {/* AGENTIC MODE */}
        {controlMode === 'AGENTIC' && (
          <AgentPanel />
        )}

      </div>
    </div>
  );
};

export default CommandCenter;
