import { commandBus } from '../bus/commandBus';
import { useStore } from '../store';

let cleanupFn: (() => void) | null = null;

export function initKeyboardTrigger(): () => void {
  if (cleanupFn) {
    cleanupFn();
  }

  const handleKeyDown = (e: KeyboardEvent) => {
    const state = useStore.getState();
    if (state.isEStop || state.mode === 'ERROR' || state.mode === 'EXECUTE' || state.controlMode !== 'KEYBOARD') return;

    // Handle Joint Selection (1-6)
    if (e.code.startsWith('Digit')) {
      const digitStr = e.code.replace('Digit', '');
      const jointIndex = parseInt(digitStr, 10);
      if (jointIndex >= 1 && jointIndex <= 6) {
        state.setActiveJoint(jointIndex);
      }
    }

    // Handle Joint Rotation (A / D)
    if (e.code === 'KeyA' || e.code === 'KeyD') {
      const { activeJoint, stepSize } = state;
      const direction = e.code === 'KeyA' ? -1 : 1;
      
      commandBus.submit({
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        source: 'keyboard',
        type: 'setJoint',
        joint: { name: `joint_${activeJoint}`, delta: direction * stepSize }
      });
    }
  };

  window.addEventListener('keydown', handleKeyDown);

  cleanupFn = () => {
    window.removeEventListener('keydown', handleKeyDown);
    cleanupFn = null;
  };

  return cleanupFn;
}
