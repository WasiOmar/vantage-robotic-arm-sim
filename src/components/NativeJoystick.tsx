import React, { useRef, useEffect, useState } from 'react';

interface NativeJoystickProps {
  color: string;
  onMove: (x: number, y: number) => void;
  onEnd: () => void;
  label?: string;
  lockX?: boolean;
  lockY?: boolean;
}

export const NativeJoystick: React.FC<NativeJoystickProps> = ({ color, onMove, onEnd, label, lockX, lockY }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const maxRadius = 40;

  useEffect(() => {
    const handlePointerMove = (e: PointerEvent) => {
      if (!isDragging || !containerRef.current) return;
      
      const rect = containerRef.current.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      
      let dx = e.clientX - centerX;
      let dy = e.clientY - centerY;

      if (lockX) dx = 0;
      if (lockY) dy = 0;

      const distance = Math.sqrt(dx * dx + dy * dy);
      
      if (distance > maxRadius) {
        dx = (dx / distance) * maxRadius;
        dy = (dy / distance) * maxRadius;
      }

      setPos({ x: dx, y: dy });
      // Normalize to -1 to 1
      onMove(dx / maxRadius, -dy / maxRadius); // -dy because screen Y is inverted
    };

    const handlePointerUp = () => {
      if (isDragging) {
        setIsDragging(false);
        setPos({ x: 0, y: 0 });
        onEnd();
      }
    };

    if (isDragging) {
      window.addEventListener('pointermove', handlePointerMove);
      window.addEventListener('pointerup', handlePointerUp);
      window.addEventListener('pointercancel', handlePointerUp);
    }

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
    };
  }, [isDragging, onMove, onEnd, lockX, lockY]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem', width: '100%' }}>
      {label && <span style={{ fontSize: '0.75rem', color: '#555', fontWeight: 'bold' }}>{label}</span>}
      <div 
        ref={containerRef}
        onPointerDown={(e) => {
          setIsDragging(true);
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        style={{ 
          width: '100px', 
          height: '100px', 
          background: 'rgba(255,255,255,0.8)', 
          borderRadius: '50%', 
          position: 'relative', 
          border: '2px solid #ddd', 
          boxShadow: 'inset 0 2px 5px rgba(0,0,0,0.1)',
          touchAction: 'none',
          cursor: isDragging ? 'grabbing' : 'grab'
        }}
      >
        {/* The stick */}
        <div style={{
          width: '40px',
          height: '40px',
          borderRadius: '50%',
          background: color,
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: `translate(calc(-50% + ${pos.x}px), calc(-50% + ${pos.y}px))`,
          boxShadow: '0 4px 8px rgba(0,0,0,0.3)',
          transition: isDragging ? 'none' : 'transform 0.2s ease-out'
        }} />
      </div>
    </div>
  );
};
