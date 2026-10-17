import { commandBus } from '../bus/commandBus';
import { useStore } from '../store';

let cleanupFn: (() => void) | null = null;
let mouseIntervalRef: number | null = null;

export function initMouseTrigger(canvasElement: HTMLCanvasElement): () => void {
  if (cleanupFn) {
    cleanupFn();
  }

  const stopRotation = () => {
    if (mouseIntervalRef !== null) {
      clearInterval(mouseIntervalRef);
      mouseIntervalRef = null;
    }
  };

  const startRotation = (direction: number) => {
    stopRotation();
    mouseIntervalRef = window.setInterval(() => {
      const state = useStore.getState();
      if (state.isEStop || state.mode === 'ERROR' || state.mode === 'EXECUTE') {
        stopRotation();
        return;
      }
      
      const { activeJoint, stepSize } = state;
      commandBus.submit({
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        source: 'mouse',
        type: 'setJoint',
        joint: { name: `joint_${activeJoint}`, delta: direction * stepSize }
      });
    }, 100); // 100ms interval to match stepSize velocity calculations
  };

  const handleMouseDown = (e: MouseEvent) => {
    const state = useStore.getState();
    if (state.controlMode !== 'MOUSE' || state.cameraMode) return;
    if (state.isEStop || state.mode === 'ERROR' || state.mode === 'EXECUTE') return;
    
    // Left click
    if (e.button === 0) startRotation(1);
    // Right click
    if (e.button === 2) startRotation(-1);
  };

  const handleMouseUp = () => stopRotation();
  
  const handleContextMenu = (e: MouseEvent) => {
    const state = useStore.getState();
    if (state.controlMode === 'MOUSE' && !state.cameraMode) {
      e.preventDefault(); // Prevent context menu when right clicking to rotate
    }
  };

  const handleWheel = (e: WheelEvent) => {
    const state = useStore.getState();
    if (state.controlMode !== 'MOUSE' || state.cameraMode) return;
    if (state.isEStop || state.mode === 'ERROR' || state.mode === 'EXECUTE') return;
    
    // Prevent default scrolling on canvas if we are using mouse mode
    e.preventDefault();

    const current = state.activeJoint;
    // Scroll up (negative deltaY) = next joint, Scroll down (positive deltaY) = prev joint
    let next = e.deltaY < 0 ? current + 1 : current - 1;
    if (next > 6) next = 1;
    if (next < 1) next = 6;
    
    state.setActiveJoint(next);
  };

  canvasElement.addEventListener('mousedown', handleMouseDown);
  window.addEventListener('mouseup', handleMouseUp);
  canvasElement.addEventListener('contextmenu', handleContextMenu);
  canvasElement.addEventListener('wheel', handleWheel, { passive: false });

  cleanupFn = () => {
    stopRotation();
    canvasElement.removeEventListener('mousedown', handleMouseDown);
    window.removeEventListener('mouseup', handleMouseUp);
    canvasElement.removeEventListener('contextmenu', handleContextMenu);
    canvasElement.removeEventListener('wheel', handleWheel);
    cleanupFn = null;
  };

  return cleanupFn;
}
