import type { ArmCommand } from '../types/commands';
import type { ArmMode } from '../types';

class ArmFSM {
  private currentState: ArmMode = 'REST';

  public getState(): ArmMode {
    return this.currentState;
  }

  public eStop(): void {
    this.currentState = 'STOP';
  }

  public fault(): void {
    this.currentState = 'ERROR';
  }

  public reset(): void {
    if (this.currentState === 'STOP' || this.currentState === 'ERROR' || this.currentState === 'AUTONOMOUS_PAUSED' || this.currentState === 'AUTONOMOUS_SEQUENCE') {
      this.currentState = 'REST';
    }
  }

  public pause(): void {
    if (this.currentState === 'AUTONOMOUS_SEQUENCE') {
      this.currentState = 'AUTONOMOUS_PAUSED';
    }
  }

  public resume(): void {
    if (this.currentState === 'AUTONOMOUS_PAUSED') {
      this.currentState = 'AUTONOMOUS_SEQUENCE';
    }
  }

  public transitionTo(newState: ArmMode): boolean {
    if (newState === 'STOP' || newState === 'ERROR') {
      this.currentState = newState;
      return true;
    }

    if (this.currentState === 'STOP' || this.currentState === 'ERROR') {
      return false; // Must explicitly call reset() first
    }

    this.currentState = newState;
    return true;
  }

  public canAccept(command: ArmCommand): boolean {
    if (this.currentState === 'STOP' || this.currentState === 'ERROR') {
      return false;
    }

    if (this.currentState === 'EXECUTE' || this.currentState === 'AUTONOMOUS_SEQUENCE' || this.currentState === 'AUTONOMOUS_PAUSED') {
      // Reject manual overrides during autonomous execution, unless it's another auto command
      if (command.source !== 'autonomous') {
        return false;
      }
      
      // If paused, reject even autonomous commands (it must be resumed first)
      if (this.currentState === 'AUTONOMOUS_PAUSED') {
        return false;
      }
    }

    if (this.currentState === 'JOGGING') {
      // Reject autonomous commands if the operator is actively jogging the arm manually
      if (command.source === 'autonomous') {
        return false;
      }
    }

    return true;
  }
}

export const fsm = new ArmFSM();
