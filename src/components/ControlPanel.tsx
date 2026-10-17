import React, { useState } from 'react';
import { useStore } from '../store';
import { Settings, Play, Square, Gauge, Zap } from 'lucide-react';

export const ControlPanel: React.FC = () => {
  const mode = useStore((state) => state.mode);
  const setMode = useStore((state) => state.setMode);
  const setJoints = useStore((state) => state.setJoints);
  const [speed, setSpeed] = useState(1.0);

  const handleSpeedChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newSpeed = parseFloat(e.target.value);
    setSpeed(newSpeed);
  };

  const handleHome = () => {
    setJoints({ joint_1: 0, joint_2: 0, joint_3: 0, joint_4: 0, joint_5: 0, joint_6: 0 });
  };

  return (
    <div className="glass-panel" style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '1rem', zIndex: 10, boxSizing: 'border-box' }}>
      
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '0.5rem' }}>
        <Settings size={18} color="#0066cc" />
        <h2 style={{ margin: 0, fontSize: '1.1rem', color: '#fff' }}>System Control</h2>
      </div>

      {/* Mode Buttons */}
      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <button 
          onClick={() => setMode('REST')}
          disabled={mode === 'REST'}
          style={{
            flex: 1, padding: '0.75rem',
            background: mode === 'REST' ? '#00ffcc' : 'rgba(0,255,204,0.1)',
            color: '#111',
            border: `1px solid ${mode === 'REST' ? '#00ffcc' : '#00cc99'}`,
            borderRadius: '4px',
            fontWeight: 'bold',
            cursor: mode === 'REST' ? 'default' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
            transition: 'all 0.2s'
          }}
        >
          <Square size={16} />
          STOP
        </button>
        <button 
          onClick={() => setMode('JOGGING')}
          disabled={mode === 'JOGGING' || mode === 'EXECUTE'}
          style={{
            flex: 1, padding: '0.75rem',
            background: mode === 'JOGGING' || mode === 'EXECUTE' ? '#0066cc' : 'rgba(0,102,204,0.1)',
            color: mode === 'JOGGING' || mode === 'EXECUTE' ? '#fff' : '#0066cc',
            border: `1px solid ${mode === 'JOGGING' || mode === 'EXECUTE' ? '#0066cc' : '#0066cc'}`,
            borderRadius: '4px',
            fontWeight: 'bold',
            cursor: (mode === 'JOGGING' || mode === 'EXECUTE') ? 'default' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
            transition: 'all 0.2s'
          }}
        >
          <Play size={16} />
          ENABLE
        </button>
      </div>

      {/* Speed Control */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', padding: '0.5rem', background: 'rgba(255,255,255,0.6)', borderRadius: '8px', border: '1px solid rgba(0,0,0,0.05)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: '0.8rem', color: '#555', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Gauge size={14} color="#555" />
            Jog Speed
          </span>
          <span style={{ fontSize: '0.8rem', color: '#0066cc', fontWeight: 'bold' }}>{speed.toFixed(2)}x</span>
        </div>
        <input 
          type="range"
          min="0.1"
          max="3.0"
          step="0.1"
          value={speed}
          onChange={handleSpeedChange}
          disabled={mode !== 'JOGGING'}
          style={{
            width: '100%',
            accentColor: '#0066cc',
            opacity: mode !== 'JOGGING' ? 0.5 : 1
          }}
        />
      </div>

      {/* Quick Actions */}
      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <button 
          onClick={handleHome}
          disabled={mode !== 'JOGGING'}
          style={{
            flex: 1, padding: '0.6rem',
            background: 'rgba(255,204,0,0.15)',
            color: '#b38f00',
            border: '1px solid rgba(179,143,0,0.3)',
            borderRadius: '4px',
            fontWeight: 'bold',
            fontSize: '0.8rem',
            cursor: mode === 'JOGGING' ? 'pointer' : 'not-allowed',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
            transition: 'all 0.2s'
          }}
        >
          <Zap size={14} />
          GO HOME
        </button>
      </div>

    </div>
  );
};

export default ControlPanel;
