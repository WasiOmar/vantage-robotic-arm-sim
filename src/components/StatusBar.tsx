import React from 'react';
import { useStore } from '../store';


const StatusBar: React.FC = () => {
  const mode = useStore((state) => state.mode);
  const backendError = useStore((state) => state.backendError);
  const resetEStop = useStore((state) => state.resetEStop);
  const triggerEStop = useStore((state) => state.triggerEStop);
  const setError = useStore((state) => state.setError);
  const showGrid = useStore((state) => state.showGrid);
  const setShowGrid = useStore((state) => state.setShowGrid);
  const controlMode = useStore((state) => state.controlMode);
  const activeJoint = useStore((state) => state.activeJoint);
  const cameraMode = useStore((state) => state.cameraMode);
  const setCameraMode = useStore((state) => state.setCameraMode);

  
  const clearError = () => setError(null);

  const getStatusColor = () => {
    switch (mode) {
      case 'REST': return '#00ffcc';
      case 'JOGGING': return '#3399ff';
      case 'EXECUTE': return '#b366ff';
      case 'ERROR': return '#ff3333';
      case 'STOP': return '#ffcc00';
      default: return '#888';
    }
  };

  return (
    <div style={{
      position: 'absolute', top: 0, left: 0, width: '100%', height: '60px',
      background: 'rgba(20, 20, 20, 0.85)', backdropFilter: 'blur(16px)',
      borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '0 1.5rem', zIndex: 100, boxSizing: 'border-box',
      boxShadow: '0 2px 10px rgba(0,0,0,0.05)'
    }}>
      
      {/* Left: Brand & Connection */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
        <h1 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800, letterSpacing: '2px', color: '#ff8c00' }}>VANTAGE</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', color: '#aaa' }}>
          WS: CONNECTED
        </div>
        <div style={{ padding: '4px 10px', background: '#333', borderRadius: '4px', fontSize: '0.85rem', fontWeight: 600, border: '1px solid #444', color: '#fff' }}>
          Input: {controlMode}
        </div>
        <div style={{ padding: '4px 10px', background: '#ff8c00', color: '#000', borderRadius: '4px', fontSize: '0.85rem', fontWeight: 800 }}>
          JOINT {activeJoint}
        </div>
        {controlMode === 'MOUSE' && (
          <button 
             onClick={() => setCameraMode(!cameraMode)}
             style={{ padding: '4px 10px', background: cameraMode ? '#ff8c00' : 'transparent', color: cameraMode ? '#000' : '#fff', borderRadius: '4px', fontSize: '0.85rem', fontWeight: 600, border: '1px solid #ff8c00', cursor: 'pointer', transition: 'all 0.2s' }}
          >
            {cameraMode ? 'PAN: ON' : 'PAN: OFF'}
          </button>
        )}
      </div>

      {/* Center: Status Badge */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <div style={{ 
          padding: '6px 16px', borderRadius: '20px', 
          background: mode === 'ERROR' ? 'rgba(255,51,51,0.1)' : 'rgba(30,30,30,0.9)',
          border: `1px solid ${getStatusColor()}`,
          color: getStatusColor(), fontWeight: 'bold', letterSpacing: '1px',
          boxShadow: `0 0 10px ${getStatusColor()}20`,
          display: 'flex', alignItems: 'center', gap: '8px'
        }}>

          {mode}
        </div>
        
        {backendError && (
          <div style={{ color: '#ff3333', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
            {backendError}
            <button 
              onClick={clearError}
              style={{ padding: '4px 12px', background: '#ff3333', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
            >
              CLEAR ERROR
            </button>
          </div>
        )}
      </div>

      {/* Right: Grid Toggle & Stop */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
        
        {/* Grid Toggle */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '0.8rem', color: '#555', fontWeight: 'bold' }}>GRID</span>
          <div 
            onClick={() => setShowGrid(!showGrid)}
            style={{
              width: '40px', height: '22px', borderRadius: '11px',
              background: showGrid ? '#ff8c00' : '#ccc',
              position: 'relative', cursor: 'pointer',
              transition: 'background 0.3s'
            }}
          >
            <div style={{
              width: '18px', height: '18px', borderRadius: '50%',
              background: '#fff', position: 'absolute', top: '2px',
              left: showGrid ? '20px' : '2px',
              transition: 'left 0.3s',
              boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
            }} />
          </div>
        </div>

        {/* Stop */}
        <button 
          onClick={mode === 'STOP' ? resetEStop : triggerEStop}
          style={{
            height: '32px', padding: '0 1.5rem',
            background: mode === 'STOP' ? '#ffcc00' : '#b22222',
            color: mode === 'STOP' ? '#000' : '#fff',
            border: 'none', borderRadius: '4px',
            fontWeight: 800, fontSize: '0.95rem', letterSpacing: '1px',
            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px',
            boxShadow: `0 0 15px ${mode === 'STOP' ? '#ffcc00' : '#b22222'}60`,
            transition: 'all 0.2s'
          }}
        >

          {mode === 'STOP' ? 'RESET STOP' : 'Stop'}
        </button>
      </div>

    </div>
  );
};

export default StatusBar;
