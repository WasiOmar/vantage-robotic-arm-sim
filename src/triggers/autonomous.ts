import { commandBus, getRejectReason } from '../bus/commandBus';
import { fsm } from '../fsm';
import { useStore } from '../store';


export type SequencePhase = 'hovering' | 'descending' | 'pressed' | 'retracting';

export interface SequenceStatus {
  pin: string;
  activeDigitIndex: number;
  phase: SequencePhase;
  status: 'IDLE' | 'EXECUTING' | 'SUCCESS' | 'FAULT';
}



export async function runPinSequence(
  pin: string, 
  onUpdate: (status: SequenceStatus) => void
): Promise<void> {
  if (pin.length === 0) return;

  // Auto-recover from any previous errors/stops
  if (fsm.getState() === 'ERROR' || fsm.getState() === 'STOP' || fsm.getState() === 'AUTONOMOUS_PAUSED') {
    fsm.reset();
  }

  if (!fsm.transitionTo('AUTONOMOUS_SEQUENCE')) {
    onUpdate({ pin, activeDigitIndex: -1, phase: 'hovering', status: 'FAULT' });
    return;
  }

  onUpdate({ pin, activeDigitIndex: 0, phase: 'hovering', status: 'EXECUTING' });

  try {
    const resp = await fetch('/key.config.json');
    const config = await resp.json();
    const keys = config.keys;

    for (let i = 0; i < pin.length; i++) {
      const digit = pin[i];
      const keyData = keys[digit];
      if (!keyData) {
        throw new Error(`Key ${digit} not found in config`);
      }

      // 1. Hover
      onUpdate({ pin, activeDigitIndex: i, phase: 'hovering', status: 'EXECUTING' });
      await executeMoveAndWait(keyData.x, keyData.y, keyData.z + 0.05, 0.01);

      // 2. Descend & Press
      onUpdate({ pin, activeDigitIndex: i, phase: 'descending', status: 'EXECUTING' });
      await executeMoveAndWait(keyData.x, keyData.y, keyData.z, 0.005);

      onUpdate({ pin, activeDigitIndex: i, phase: 'pressed', status: 'EXECUTING' });
      await new Promise(resolve => setTimeout(resolve, 200));

      // 3. Retract
      onUpdate({ pin, activeDigitIndex: i, phase: 'retracting', status: 'EXECUTING' });
      await executeMoveAndWait(keyData.x, keyData.y, keyData.z + 0.05, 0.01);
    }

    onUpdate({ pin, activeDigitIndex: pin.length - 1, phase: 'retracting', status: 'SUCCESS' });
    fsm.transitionTo('REST');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    useStore.getState().addLog({ source: 'autonomous', type: 'error', message: `Autonomous sequence failed: ${msg}` });
    // An E-stop must stay latched; a refused target is a rejected command, not
    // an arm fault, so return to REST and let the operator keep working.
    if (fsm.getState() !== 'STOP') {
      fsm.reset();
    }
    onUpdate({ pin, activeDigitIndex: -1, phase: 'hovering', status: 'FAULT' });
  }
}

async function executeMoveAndWait(x: number, y: number, z: number, _tolerance: number): Promise<void> {
  // Clear any previous errors
  useStore.getState().setError(null);

  const id = crypto.randomUUID();
  // submit() resolves once the executor has finished (or aborted) the motion,
  // so awaiting it is both simpler and more reliable than polling joint deltas.
  const verdict = await commandBus.submit({
    id,
    source: 'autonomous',
    type: 'moveTo',
    target: { x, y, z, approach: [0, 0, -1] },
    timestamp: Date.now()
  });

  if (verdict !== 'ACCEPTED') {
    throw new Error(getRejectReason(id) || useStore.getState().backendError || 'Command rejected');
  }
  const state = fsm.getState();
  if (state === 'STOP' || state === 'ERROR') {
    throw new Error('Sequence halted by emergency stop');
  }
}
