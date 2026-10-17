import { useStore } from '../store';

/** Simple UI to exercise the inverse‑kinematics solver.
 *  Clicking the button emits a `moveTo` command to a fixed target.
 */
export default function IKTest() {
  const setActiveCommand = useStore((state) => state.setActiveCommand);

  const handleTest = () => {
    const target = { x: 0.3, y: 0.2, z: 0.4, approach: [0, 0, -1] as [number, number, number] };
    setActiveCommand({
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      source: 'dashboard',
      type: 'moveTo',
      target,
    });
  };

  return (
    <div className="glass-panel" style={{ padding: '0.8rem', marginTop: '0.5rem' }}>
      <h3 style={{ margin: 0, fontSize: '1rem', color: '#00ccff' }}>IK Test</h3>
      <button
        onClick={handleTest}
        style={{
          marginTop: '0.5rem',
          padding: '0.5rem 1rem',
          background: '#0066ff',
          color: '#fff',
          border: 'none',
          borderRadius: '4px',
          cursor: 'pointer',
        }}
      >
        Move to demo target
      </button>
    </div>
  );
}
