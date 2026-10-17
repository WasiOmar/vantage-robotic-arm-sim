import { callLLM, isConnectivityError, LLMError } from './llmClient';
import { toolSchemas } from './tools';
import { commandBus, getRejectReason } from '../bus/commandBus';
import { speak } from './tts';
import { useAgentStore } from './agentStore';
import { useStore } from '../store';
import { fsm } from '../fsm';
import { getEndEffectorPose } from '../kinematics';
import { describeCommand } from '../triggers/voice/grammar';
import { describeReason, executeUtterance } from '../triggers/voice/runUtterance';
import type { ArmCommand } from '../types/commands';
import type { JointState } from '../types';

const DEG = Math.PI / 180;
const MAX_LLM_CALLS_PER_TURN = 8;
const MAX_REJECTIONS_PER_TURN = 3;
// History is append-only (required for preserved thinking); once it grows past
// this we start a fresh conversation instead of trimming old turns.
const MAX_HISTORY_MESSAGES = 40;

const SYSTEM_PROMPT = `You control the Vantage 6-DOF robotic arm (simulated) through tools. An operator talks to you by text or voice; voice transcripts can contain small errors ("for" meaning "four", "join" meaning "joint").

Arm facts:
- Base at (0,0,0), z up, floor at z=0 (anything below is forbidden). Reach is 1.19 m from the base.
- Joints 1-6: 1 base yaw, 2 shoulder, 3 elbow, 4 wrist roll, 5 wrist pitch, 6 wrist yaw.
- Keypad keys (meters, base frame). Row y=+0.05: key 1 (x 0.50), key 2 (x 0.55), key 3 (x 0.60). Row y=-0.05: key 4 (x 0.50), key 5 (x 0.55), key 6 (x 0.60).
- Every motion passes a safety gate (joint limits, reach, floor and self collision). If a step is rejected you get the reason; adjust and retry or ask the operator. Never retry the identical command.

How to act:
- Do what was asked with the fewest tools. For multi-step requests ("press 3 then 5, then go home") emit all the tool calls in one response, in order.
- press_key presses a single key; use enter_pin only for a full 6-digit PIN.
- Use operator units: joints are 1-6 and angles in degrees; move_tip takes centimeters; move_to takes meters.
- "Left/right/top/bottom/first/second" for keys depends on where the operator stands; if the request refers to keys only by such words without a key number, call clarify instead of guessing. Also clarify when coordinates or amounts are missing.
- Call get_state before relative reasoning about the current pose or to answer questions about the arm.
- You cannot reset an emergency stop; tell the operator to press Reset.
- Keep any text reply to one or two short sentences. No markdown.`;

let history: any[] = [];
let activeRun: { cancelled: boolean; controller: AbortController } | null = null;
let resolveUserReply: ((text: string | null) => void) | null = null;

export function supplyUserReply(text: string) {
  if (resolveUserReply) {
    const r = resolveUserReply;
    resolveUserReply = null;
    r(text);
  }
}

function waitForUserReply(): Promise<string | null> {
  return new Promise((resolve) => {
    resolveUserReply = resolve;
  });
}

/** Abort the current run: in-flight LLM call, remaining steps and any pending question. */
export function cancelAgent(): void {
  if (activeRun) {
    activeRun.cancelled = true;
    activeRun.controller.abort();
  }
  if (resolveUserReply) {
    const r = resolveUserReply;
    resolveUserReply = null;
    r(null);
  }
}

/** Forget the conversation (used by "Clear"). */
export function resetConversation(): void {
  cancelAgent();
  history = [];
}

export function isAgentBusy(): boolean {
  return activeRun !== null;
}

function appendUserText(text: string): void {
  const last = history[history.length - 1];
  if (last && last.role === 'user') {
    // The previous user turn never got an assistant reply (local finish, error or
    // refusal), so extend it rather than sending two user turns.
    const content = Array.isArray(last.content) ? last.content : [{ type: 'text', text: last.content }];
    last.content = [...content, { type: 'text', text }];
  } else {
    history.push({ role: 'user', content: text });
  }
}

function dropTrailingUserText(text: string): void {
  const last = history[history.length - 1];
  if (!last || last.role !== 'user') return;
  if (last.content === text) {
    history.pop();
  } else if (Array.isArray(last.content)) {
    const blocks = last.content;
    const tail = blocks[blocks.length - 1];
    if (tail?.type === 'text' && tail.text === text) last.content = blocks.slice(0, -1);
    if (last.content.length === 0) history.pop();
  }
}

function toolResult(id: string, content: string, isError = false) {
  return isError ? { type: 'tool_result', tool_use_id: id, content, is_error: true } : { type: 'tool_result', tool_use_id: id, content };
}

const round = (v: number, d = 3) => Math.round(v * 10 ** d) / 10 ** d;

function readArmState() {
  const s = useStore.getState();
  const keys: (keyof JointState)[] = ['joint_1', 'joint_2', 'joint_3', 'joint_4', 'joint_5', 'joint_6'];
  const joints: Record<string, number> = {};
  const limits: Record<string, [number, number]> = {};
  keys.forEach((k, i) => {
    joints[`joint_${i + 1}_deg`] = round(s.joints[k] / DEG, 1);
    const lim = s.urdfLimits[k];
    if (lim) limits[`joint_${i + 1}`] = [round(lim.min / DEG, 1), round(lim.max / DEG, 1)];
  });
  let tip: { x: number; y: number; z: number } | null = null;
  try {
    const p = getEndEffectorPose(s.joints);
    tip = { x: round(p.x), y: round(p.y), z: round(p.z) };
  } catch {
    tip = null;
  }
  return {
    safety_mode: fsm.getState(),
    estopped: s.isEStop,
    speed_rpm: Math.round(s.rpm),
    joints,
    joint_limits_deg: limits,
    tip_position_m: tip,
  };
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : null);

type Mapped = { command: ArmCommand } | { error: string };

export function mapToolCallToCommand(name: string, input: any): Mapped {
  input = input ?? {};
  const common = { id: crypto.randomUUID(), source: 'agent' as const, timestamp: Date.now() };
  const jointIdx = (j: unknown, zeroBased = false): number | null => {
    const n = num(j);
    if (n === null || !Number.isInteger(n)) return null;
    const idx = zeroBased ? n : n - 1;
    return idx >= 0 && idx <= 5 ? idx : null;
  };

  switch (name) {
    case 'press_key': {
      const key = num(input.key ?? input.keyIndex);
      if (key === null || !Number.isInteger(key) || key < 1 || key > 6) return { error: 'key must be an integer 1-6' };
      return { command: { ...common, type: 'press_key', keyIndex: key } };
    }
    case 'enter_pin': {
      const raw: unknown[] = Array.isArray(input.digits) ? input.digits : String(input.digits ?? input.pin ?? '').replace(/\D/g, '').split('');
      const digits = raw.map((d) => num(d));
      if (digits.length !== 6 || digits.some((d) => d === null || !Number.isInteger(d) || d < 1 || d > 6)) {
        return { error: 'PIN must be exactly 6 digits, each 1-6' };
      }
      return { command: { ...common, type: 'enter_pin', digits: digits as number[] } };
    }
    case 'jog_joint': {
      const idx = jointIdx(input.joint);
      const deg = num(input.degrees);
      if (idx === null) return { error: 'joint must be an integer 1-6' };
      if (deg === null || deg === 0) return { error: 'degrees must be a non-zero number' };
      return { command: { ...common, type: 'jog', jointIndex: idx, deltaRad: deg * DEG } };
    }
    case 'set_joint': {
      const idx = jointIdx(input.joint);
      const deg = num(input.degrees);
      if (idx === null) return { error: 'joint must be an integer 1-6' };
      if (deg === null) return { error: 'degrees must be a number' };
      return { command: { ...common, type: 'rotate_joint', jointIndex: idx, absRad: deg * DEG } };
    }
    case 'move_tip': {
      const dx = num(input.dx_cm) ?? 0;
      const dy = num(input.dy_cm) ?? 0;
      const dz = num(input.dz_cm) ?? 0;
      if (!dx && !dy && !dz) return { error: 'at least one of dx_cm, dy_cm, dz_cm must be non-zero' };
      if (Math.hypot(dx, dy, dz) > 50) return { error: 'relative move larger than 50 cm; use move_to' };
      return { command: { ...common, type: 'jog', delta: { x: dx / 100, y: dy / 100, z: dz / 100 } } };
    }
    case 'move_to': {
      const x = num(input.x), y = num(input.y), z = num(input.z);
      if (x === null || y === null || z === null) return { error: 'x, y and z (meters) are required' };
      return { command: { ...common, type: 'moveTo', target: { x, y, z } } };
    }
    case 'go_home':
      return { command: { ...common, type: 'goto', targetName: 'home' } };
    case 'set_speed': {
      const rpm = num(input.rpm);
      if (rpm === null || rpm <= 0) return { error: 'rpm must be a positive number' };
      return { command: { ...common, type: 'set_speed', rpm } };
    }
    case 'wait': {
      const s = num(input.seconds) ?? 1;
      return { command: { ...common, type: 'wait', durationMs: Math.min(10, Math.max(0, s)) * 1000 } };
    }
    case 'estop':
      return { command: { ...common, type: 'estop' } };

    // ---- Legacy tool names (older prompts / tests) ----
    case 'goto': {
      if (input.targetName === 'home' || (!input.target && !input.x)) return { command: { ...common, type: 'goto', targetName: 'home' } };
      const t = input.target ?? input;
      const x = num(t.x), y = num(t.y), z = num(t.z);
      if (x === null || y === null || z === null) return { error: 'target x, y, z required' };
      return { command: { ...common, type: 'moveTo', target: { x, y, z, ...(Array.isArray(t.approach) ? { approach: t.approach } : {}) } } };
    }
    case 'jog': {
      if (input.delta) {
        const d = input.delta;
        return { command: { ...common, type: 'jog', delta: { x: num(d.x) ?? 0, y: num(d.y) ?? 0, z: num(d.z) ?? 0 } } };
      }
      const idx = jointIdx(input.jointIndex, true);
      const rad = num(input.deltaRad);
      if (idx === null || rad === null) return { error: 'jointIndex (0-5) and deltaRad required' };
      return { command: { ...common, type: 'jog', jointIndex: idx, deltaRad: rad } };
    }
    case 'rotate_joint': {
      const idx = jointIdx(input.jointIndex, true);
      const rad = num(input.absRad);
      if (idx === null || rad === null) return { error: 'jointIndex (0-5) and absRad required' };
      return { command: { ...common, type: 'rotate_joint', jointIndex: idx, absRad: rad } };
    }
    default:
      return { error: `unknown tool ${name}` };
  }
}

function friendlyError(err: unknown): string {
  if (err instanceof LLMError) return err.message;
  if (err instanceof Error) return err.message;
  return String(err);
}

function say(text: string): void {
  if (useAgentStore.getState().speakResult && text) speak(text);
}

function summarize(labels: string[]): string {
  if (labels.length === 0) return 'Done.';
  if (labels.length === 1) return `Done: ${labels[0]}.`;
  return `Done: ${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}.`;
}

async function runLocalFallback(userText: string, err: unknown): Promise<void> {
  const store = useAgentStore.getState();
  store.setLlmStatus(err instanceof LLMError && err.kind === 'no-key' ? 'no-key' : 'offline');
  store.setThinking(false);
  store.setExecuting(true);
  const outcome = await executeUtterance(userText, 'agent');
  store.setExecuting(false);

  if (outcome.kind === 'executed') {
    store.addMessage({ sender: 'system', type: 'info', text: `LLM unavailable: ${friendlyError(err).replace(/[.\s]+$/, '')}. Ran it with the built-in command parser.` });
    for (const s of outcome.steps) {
      store.addMessage({
        sender: 'agent',
        type: 'tool_call',
        text: s.label,
        status: s.verdict === 'ACCEPTED' ? 'done' : s.verdict === 'REJECTED' ? 'rejected' : 'skipped',
        detail: s.verdict === 'REJECTED' ? describeReason(s.reason) : undefined,
      });
    }
    say(outcome.ok ? summarize(outcome.steps.map((s) => s.label)) : `Rejected: ${describeReason(outcome.steps.find((s) => s.verdict === 'REJECTED')?.reason)}`);
    return;
  }
  store.setError(`${friendlyError(err)} The offline parser couldn't run this either. Try a direct command such as "press key 3 then go home".`);
}

export async function runAgent(userText: string): Promise<void> {
  const store = useAgentStore.getState();
  const text = userText.trim();
  if (!text) return;

  // A reply to a clarify() question.
  if (store.waitingForClarification && resolveUserReply) {
    store.addMessage({ sender: 'user', text, type: 'text' });
    supplyUserReply(text);
    return;
  }
  if (activeRun) return; // one run at a time; the UI disables input meanwhile

  const run = { cancelled: false, controller: new AbortController() };
  activeRun = run;
  store.setError(null);
  store.addMessage({ sender: 'user', text, type: 'text' });
  if (history.length > MAX_HISTORY_MESSAGES) history = [];
  appendUserText(text);
  store.setThinking(true);

  const done: string[] = [];
  let rejections = 0;

  try {
    for (let call = 0; call < MAX_LLM_CALLS_PER_TURN; call++) {
      let response;
      try {
        response = await callLLM(history, toolSchemas, { system: SYSTEM_PROMPT, signal: run.controller.signal });
      } catch (err) {
        if (run.cancelled) return;
        if (call === 0 && isConnectivityError(err)) {
          dropTrailingUserText(text);
          await runLocalFallback(text, err);
          return;
        }
        throw err;
      }
      if (run.cancelled) return;
      useAgentStore.getState().setLlmStatus('online');

      if (response.stop_reason === 'refusal') {
        store.addMessage({ sender: 'agent', type: 'rejection', text: 'The model declined this request.', detail: response.stop_details?.explanation ?? undefined });
        return;
      }

      const content = response.content ?? [];
      // Echo the assistant turn back unchanged (thinking blocks included).
      history.push({ role: 'assistant', content });

      const reply = content
        .filter((b) => b.type === 'text' && typeof b.text === 'string')
        .map((b) => b.text as string)
        .join(' ')
        .trim();
      const toolUses = content.filter((b) => b.type === 'tool_use');
      if (reply) store.addMessage({ sender: 'agent', text: reply, type: 'text' });

      if (toolUses.length === 0) {
        say(reply || (done.length ? summarize(done) : ''));
        return;
      }

      // ---- Clarifying question -------------------------------------------
      const clarify = toolUses.find((b) => b.name === 'clarify');
      if (clarify) {
        const question = String(clarify.input?.question || 'Could you clarify what you want me to do?');
        store.addMessage({ sender: 'agent', text: question, type: 'clarify' });
        say(question);
        store.setThinking(false);
        store.setWaitingForClarification(true);
        const answer = await waitForUserReply();
        store.setWaitingForClarification(false);

        const results = toolUses.map((b) =>
          b === clarify
            ? toolResult(b.id!, answer === null ? 'The operator cancelled.' : `Operator answered: ${answer}`)
            : toolResult(b.id!, 'Not executed: waiting for the clarification. Re-issue it if still needed.')
        );
        history.push({ role: 'user', content: results });
        if (answer === null || run.cancelled) return;
        store.setThinking(true);
        continue;
      }

      // ---- Execute the plan step by step ---------------------------------
      store.setThinking(false);
      store.setExecuting(true);
      const results: any[] = [];
      let halted = false;
      let needsFollowUp = false;
      let blockedByStop = false;

      for (const block of toolUses) {
        const id = block.id!;
        if (halted || run.cancelled) {
          results.push(toolResult(id, 'Skipped: an earlier step was rejected or the run was cancelled.'));
          continue;
        }
        if (block.name === 'get_state') {
          store.addMessage({ sender: 'agent', type: 'tool_call', text: 'Read arm state', status: 'done', toolCallName: 'get_state' });
          results.push(toolResult(id, JSON.stringify(readArmState())));
          needsFollowUp = true;
          continue;
        }

        const mapped = mapToolCallToCommand(block.name ?? '', block.input);
        if ('error' in mapped) {
          store.addMessage({ sender: 'agent', type: 'tool_call', text: `${block.name}`, status: 'rejected', detail: `Invalid arguments: ${mapped.error}` });
          results.push(toolResult(id, `Invalid arguments: ${mapped.error}`, true));
          halted = true;
          needsFollowUp = true;
          rejections++;
          continue;
        }

        const command = mapped.command;
        const label = describeCommand(command);
        const msgId = store.addMessage({
          sender: 'agent',
          type: 'tool_call',
          text: label,
          status: 'running',
          toolCallName: block.name,
          toolCallArgs: block.input,
        });

        const verdict = await commandBus.dispatch(command);
        if (verdict === 'ACCEPTED') {
          store.updateMessage(msgId, { status: 'done' });
          done.push(label.charAt(0).toLowerCase() + label.slice(1));
          results.push(toolResult(id, `OK: ${label} completed.`));
          if (command.type === 'estop') halted = true;
        } else {
          const reason = getRejectReason(command.id) || 'VALIDATION_FAILED';
          store.updateMessage(msgId, { status: 'rejected', detail: describeReason(reason) });
          results.push(toolResult(id, `Rejected by the safety gate: ${reason}. ${describeReason(reason)}`, true));
          halted = true;
          needsFollowUp = true;
          rejections++;
          if (reason === 'FSM_REJECTED' && fsm.getState() === 'STOP') blockedByStop = true;
        }
      }
      store.setExecuting(false);
      history.push({ role: 'user', content: results });

      if (run.cancelled) return;
      if (blockedByStop) {
        store.addMessage({ sender: 'system', type: 'info', text: 'The arm is emergency-stopped. Press Reset, then ask again.' });
        say('The arm is emergency stopped. Press reset first.');
        return;
      }
      if (!needsFollowUp) {
        say(summarize(done));
        return;
      }
      if (rejections >= MAX_REJECTIONS_PER_TURN) {
        store.addMessage({ sender: 'system', type: 'info', text: `Gave up after ${rejections} rejected attempts. Try rephrasing or a smaller move.` });
        say('I could not find a safe way to do that.');
        return;
      }
      store.setThinking(true);
    }
    store.addMessage({ sender: 'system', type: 'info', text: 'Stopped: the plan needed too many steps.' });
  } catch (err) {
    if (!run.cancelled) {
      console.error(err);
      store.setError(friendlyError(err));
      if (err instanceof LLMError && (err.kind === 'no-key' || err.kind === 'offline')) {
        store.setLlmStatus(err.kind === 'no-key' ? 'no-key' : 'offline');
      }
    }
  } finally {
    if (run.cancelled) {
      store.addMessage({ sender: 'system', type: 'info', text: 'Cancelled.' });
    }
    const s = useAgentStore.getState();
    s.setThinking(false);
    s.setExecuting(false);
    s.setWaitingForClarification(false);
    if (activeRun === run) activeRun = null;
  }
}
