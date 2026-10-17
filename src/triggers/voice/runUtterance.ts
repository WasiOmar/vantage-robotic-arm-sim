import { commandBus, getRejectReason } from '../../bus/commandBus';
import type { ArmCommand, CommandSource } from '../../types/commands';
import { parseCommandSequence, describeCommand } from './grammar';

export interface StepResult {
  command: ArmCommand;
  label: string;
  verdict: 'ACCEPTED' | 'REJECTED' | 'SKIPPED';
  reason?: string;
}

export type UtteranceOutcome =
  | { kind: 'executed'; text: string; steps: StepResult[]; ok: boolean }
  | { kind: 'not_understood'; text: string; reason: string; hint?: string; steps: StepResult[] }
  | { kind: 'help'; text: string }
  | { kind: 'nothing_to_repeat'; text: string };

const REASON_TEXT: Record<string, string> = {
  FSM_REJECTED: 'Arm is busy or E-stopped. Say "reset" to clear the stop.',
  JOINT_LIMIT_VIOLATION: 'That would push a joint past its limit.',
  VELOCITY_LIMIT_VIOLATION: 'Too fast for the joint. Try a smaller step.',
  UNREACHABLE_TARGET: 'Target is outside the arm\'s 1.19 m reach.',
  OUT_OF_BOUNDS: 'Target is below the floor (z < 0).',
  Z_COLLISION: 'Blocked: the stylus would hit the floor.',
  SELF_COLLISION: 'Blocked: the stylus would hit the arm\'s base.',
  INVALID_KEY_INDEX: 'That key does not exist (keys 1–6).',
  INVALID_PIN: 'PIN must be 6 digits, each 1–6.',
  PIN_SEQUENCE_FAILED: 'PIN sequence could not finish.',
  INTERRUPTED_BY_ESTOP: 'Interrupted by emergency stop.',
  UNSUPPORTED_COMMAND_TYPE: 'That command is not supported.',
  INVALID_SPEED: 'Invalid speed value.',
};

/** Turns a safety-gate reason code into a sentence an operator understands. */
export function describeReason(reason?: string): string {
  if (!reason) return 'Rejected by the safety gate.';
  if (REASON_TEXT[reason]) return REASON_TEXT[reason];
  if (reason.startsWith('IK_FAILED')) return 'Could not find a joint solution for that target.';
  return reason;
}

const REPEAT_RE = /^\s*(?:(?:do (?:that|it) )?again|repeat(?: that| last(?: command)?)?|one more time|same again)\s*[.!]?\s*$/i;
const HELP_RE = /^\s*(?:help|what can i say|commands|show (?:me )?commands|what can you do)\s*[?.!]?\s*$/i;

let lastSequence: ArmCommand[] | null = null;

function cloneForSource(cmd: ArmCommand, source: CommandSource): ArmCommand {
  return { ...cmd, id: crypto.randomUUID(), timestamp: Date.now(), source };
}

async function runSequence(commands: ArmCommand[], source: CommandSource): Promise<StepResult[]> {
  const steps: StepResult[] = [];
  let halted = false;
  for (const original of commands) {
    const command = cloneForSource(original, source);
    const label = describeCommand(command);
    if (halted) {
      steps.push({ command, label, verdict: 'SKIPPED' });
      continue;
    }
    const verdict = await commandBus.dispatch(command);
    if (verdict === 'ACCEPTED') {
      steps.push({ command, label, verdict: 'ACCEPTED' });
      if (command.type === 'estop') halted = true;
    } else {
      steps.push({ command, label, verdict: 'REJECTED', reason: getRejectReason(command.id) });
      halted = true;
    }
  }
  return steps;
}

/**
 * Parse an utterance (spoken or typed) and run every command in it, in order.
 * Stops at the first rejection so a failed step never leaves later steps running
 * from an unexpected pose.
 */
export async function executeUtterance(text: string, source: CommandSource = 'voice'): Promise<UtteranceOutcome> {
  const trimmed = (text ?? '').trim();

  if (HELP_RE.test(trimmed)) return { kind: 'help', text: trimmed };

  if (REPEAT_RE.test(trimmed)) {
    if (!lastSequence) return { kind: 'nothing_to_repeat', text: trimmed };
    const steps = await runSequence(lastSequence, source);
    return { kind: 'executed', text: trimmed, steps, ok: steps.every((s) => s.verdict === 'ACCEPTED') };
  }

  const { commands, error } = parseCommandSequence(trimmed);
  if (error) {
    // Nothing runs if any segment is unintelligible: half-executing a sentence is worse.
    return { kind: 'not_understood', text: trimmed, reason: error.reason, hint: error.hint, steps: [] };
  }

  // Don't make "again" re-trigger a stop/reset; those are deliberate one-offs.
  if (!commands.every((c) => c.type === 'estop' || c.type === 'reset')) {
    lastSequence = commands;
  }
  const steps = await runSequence(commands, source);
  return { kind: 'executed', text: trimmed, steps, ok: steps.every((s) => s.verdict === 'ACCEPTED') };
}

/** Example phrases grouped for the in-app cheat sheet. */
export const VOICE_EXAMPLES: { group: string; phrases: string[] }[] = [
  { group: 'Keypad', phrases: ['press key 3', 'press keys 1, 4 and 6', 'tap the second key', 'enter pin 1 2 3 4 5 6'] },
  { group: 'Joints', phrases: ['jog joint 1 by 15 degrees', 'rotate joint 2 to 30 degrees', 'turn the base left 20 degrees', 'elbow down a little'] },
  { group: 'Tip (cm)', phrases: ['move up 5 cm', 'nudge left 2 centimeters', 'move forward 3 cm', 'go to x 0.5 y 0 z 0.2'] },
  { group: 'System', phrases: ['go home', 'stop', 'reset', 'set speed to 40 rpm', 'faster', 'again'] },
  { group: 'Chains', phrases: ['press key 2 then go home', 'go home, wait 1 second, then press key 5'] },
];
