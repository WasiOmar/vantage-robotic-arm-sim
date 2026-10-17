import nipplejs from 'nipplejs';
import { commandBus } from '../bus/commandBus';
import { useStore } from '../store';

let leftManager: any = null;
let rightManager: any = null;
let speedManager: any = null;
let rotationIntervalRef: number | null = null;

export function initDualJoystickGUI(
  leftContainer: HTMLDivElement,
  rightContainer: HTMLDivElement,
  speedContainer: HTMLDivElement
): () => void {
  // Clean up existing instances if any
  if (leftManager) leftManager.destroy();
  if (rightManager) rightManager.destroy();
  if (speedManager) speedManager.destroy();
  if (rotationIntervalRef !== null) clearInterval(rotationIntervalRef);

  const applyPremiumTheme = (manager: any, color: string) => {
    // NippleJS creates the UI asynchronously sometimes, but in static mode it's usually immediate.
    setTimeout(() => {
      if (manager && manager[0] && manager[0].ui) {
        const ui = manager[0].ui;
        if (ui.back) {
          ui.back.style.background = 'rgba(10, 10, 15, 0.4)';
          ui.back.style.border = `2px solid ${color}80`;
          ui.back.style.boxShadow = `0 0 15px ${color}30, inset 0 0 10px rgba(0,0,0,0.8)`;
          ui.back.style.opacity = '1';
        }
        if (ui.front) {
          ui.front.style.background = `linear-gradient(135deg, ${color}, #ffffff)`;
          ui.front.style.boxShadow = `0 4px 12px ${color}90`;
          ui.front.style.border = '1px solid rgba(255,255,255,0.5)';
          ui.front.style.opacity = '1';
        }
      }
    }, 50);
  };

  // --- Left Stick (Toggle Joint Y) ---
  leftManager = nipplejs.create({
    zone: leftContainer,
    mode: 'static',
    position: { left: '50%', top: '50%' },
    color: '#9933ff', // Robitic purple/blue vibe
    size: 100,
    lockX: true // Lock X axis so it only moves up/down (Y axis)
  });
  applyPremiumTheme(leftManager, '#9933ff');

  let lastCycleTime = 0;
  leftManager.on('move', ((_: any, data: any) => {
    const state = useStore.getState();
    if (state.isEStop || state.mode === 'ERROR' || state.mode === 'EXECUTE' || state.controlMode !== 'JOYSTICK') return;

    const threshold = 30;
    const now = Date.now();
    
    if (data.distance > threshold && now - lastCycleTime > 300) {
      const angle = data.angle.degree;
      if (angle > 45 && angle < 135) {
        let next = state.activeJoint - 1;
        if (next < 1) next = 6;
        state.setActiveJoint(next);
        lastCycleTime = now;
      } else if (angle > 225 && angle < 315) {
        let next = state.activeJoint + 1;
        if (next > 6) next = 1;
        state.setActiveJoint(next);
        lastCycleTime = now;
      }
    }
  }) as any);

  // --- Right Stick (Rotate Servo X) ---
  rightManager = nipplejs.create({
    zone: rightContainer,
    mode: 'static',
    position: { left: '50%', top: '50%' },
    color: '#00ccff',
    size: 100,
    lockY: true // Lock Y axis so it only moves left/right (X axis)
  });
  applyPremiumTheme(rightManager, '#00ccff');

  let currentDirection = 0;

  rightManager.on('move', ((_: any, data: any) => {
    const state = useStore.getState();
    if (state.isEStop || state.mode === 'ERROR' || state.mode === 'EXECUTE' || state.controlMode !== 'JOYSTICK') return;

    const threshold = 10;
    if (data.distance > threshold) {
      const angle = data.angle.degree;
      if (angle < 45 || angle > 315) {
        currentDirection = 1;
      } else if (angle > 135 && angle < 225) {
        currentDirection = -1;
      } else {
        currentDirection = 0;
      }
    } else {
      currentDirection = 0;
    }
  }) as any);

  rightManager.on('end', () => {
    currentDirection = 0;
  });

  // --- Speed Stick (RPM Control Y) ---
  speedManager = nipplejs.create({
    zone: speedContainer,
    mode: 'static',
    position: { left: '50%', top: '50%' },
    color: '#ff3366', // distinct color for speed
    size: 100,
    lockX: true // Lock X axis so it only moves up/down (Y axis)
  });
  applyPremiumTheme(speedManager, '#ff3366');

  let speedInterval: number | null = null;
  let currentSpeedData: { angle: number; distance: number } | null = null;

  speedManager.on('move', ((_: any, data: any) => {
    currentSpeedData = { angle: data.angle.degree, distance: data.distance };
    
    if (speedInterval === null) {
      speedInterval = window.setInterval(() => {
        if (!currentSpeedData) return;
        
        const state = useStore.getState();
        const angle = currentSpeedData.angle;
        let deltaRpm = 0;
        
        // Map distance to rate of RPM change
        const rate = (currentSpeedData.distance / 50); 
        
        if (angle > 45 && angle < 135) deltaRpm = rate * 2; // Up increases RPM
        else if (angle > 225 && angle < 315) deltaRpm = -rate * 2; // Down decreases RPM
        
        if (deltaRpm !== 0) {
          const newRpm = Math.max(0, Math.min(255, state.rpm + deltaRpm));
          state.setRpm(newRpm);
        }
      }, 50);
    }
  }) as any);

  speedManager.on('end', () => {
    currentSpeedData = null;
    if (speedInterval !== null) {
      clearInterval(speedInterval);
      speedInterval = null;
    }
  });

  // Emitting commands at a fixed rate
  rotationIntervalRef = window.setInterval(() => {
    if (currentDirection !== 0) {
      const state = useStore.getState();
      if (state.isEStop || state.mode === 'ERROR' || state.mode === 'EXECUTE') return;

      const { activeJoint, stepSize } = state;
      console.log(`[Joystick] Emitting setJoint for joint_${activeJoint} with delta ${currentDirection * stepSize}`);
      commandBus.submit({
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        source: 'joystick',
        type: 'setJoint',
        joint: { name: `joint_${activeJoint}`, delta: currentDirection * stepSize }
      });
    }
  }, 100); // 10Hz stream

  return () => {
    if (leftManager) leftManager.destroy();
    if (rightManager) rightManager.destroy();
    if (speedManager) speedManager.destroy();
    if (rotationIntervalRef !== null) clearInterval(rotationIntervalRef);
    if (speedInterval !== null) clearInterval(speedInterval);
    leftManager = null;
    rightManager = null;
    speedManager = null;
  };
}
