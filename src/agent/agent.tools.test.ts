import { vi, describe, it, expect, beforeEach } from 'vitest';
import { runAgent, mapToolCallToCommand, resetConversation } from './agent';
import { useAgentStore } from './agentStore';
import { auditLog } from '../audit';
import { useStore } from '../store';
import { fsm } from '../fsm';
import { callLLM, LLMError } from './llmClient';

vi.mock('./llmClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./llmClient')>();
  return { ...actual, callLLM: vi.fn() };
});

const KEYS = {
  keys: {
    '1': { x: 0.5, y: 0.05, z: 0.05 }, '2': { x: 0.55, y: 0.05, z: 0.05 }, '3': { x: 0.6, y: 0.05, z: 0.05 },
    '4': { x: 0.5, y: -0.05, z: 0.05 }, '5': { x: 0.55, y: -0.05, z: 0.05 }, '6': { x: 0.6, y: -0.05, z: 0.05 },
  },
};

describe('agent tool mapping', () => {
  it('maps operator units to commands', () => {
    const jog = mapToolCallToCommand('jog_joint', { joint: 2, degrees: 30 });
    expect('command' in jog && jog.command.jointIndex).toBe(1);
    expect('command' in jog && jog.command.deltaRad).toBeCloseTo(Math.PI / 6);

    const tip = mapToolCallToCommand('move_tip', { dz_cm: 5 });
    expect('command' in tip && tip.command.delta).toEqual({ x: 0, y: 0, z: 0.05 });

    expect('error' in mapToolCallToCommand('press_key', { key: 9 })).toBe(true);
    expect('error' in mapToolCallToCommand('enter_pin', { digits: [1, 2, 3, 4, 5, 7] })).toBe(true);
    expect('command' in mapToolCallToCommand('enter_pin', { digits: '123456' })).toBe(true);
  });
});

describe('agent loop', () => {
  beforeEach(() => {
    vi.mocked(callLLM).mockReset();
    resetConversation();
    useAgentStore.getState().clearMessages();
    useStore.getState().resetEStop();
    fsm.reset();
    fsm.transitionTo('REST');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => KEYS }));
  });

  it('falls back to the built-in parser when the LLM is unreachable', async () => {
    vi.mocked(callLLM).mockRejectedValue(new LLMError('offline', 'Cannot reach the LLM proxy'));
    await runAgent('press key 2 then go home');

    const entries = auditLog.getLog().slice(-2);
    expect(entries.map((e) => [e.command.type, e.command.source, e.verdict])).toEqual([
      ['press_key', 'agent', 'ACCEPTED'],
      ['goto', 'agent', 'ACCEPTED'],
    ]);
    expect(useAgentStore.getState().llmStatus).toBe('offline');
    expect(useAgentStore.getState().error).toBeNull();
  });

  it('skips later steps after a rejection and reports it back to the model', async () => {
    vi.mocked(callLLM)
      .mockResolvedValueOnce({
        content: [
          { type: 'tool_use', id: 'a', name: 'move_to', input: { x: 2, y: 0, z: 0.3 } },
          { type: 'tool_use', id: 'b', name: 'press_key', input: { key: 1 } },
        ],
      })
      .mockResolvedValueOnce({ content: [{ type: 'text', text: 'That point is out of reach.' }] });

    await runAgent('go to 2 0 0.3 then press key 1');

    const history = vi.mocked(callLLM).mock.calls[1][0] as any[];
    const results = history.filter((m) => m.role === 'user' && Array.isArray(m.content)).pop().content;
    expect(results[0]).toMatchObject({ tool_use_id: 'a', is_error: true });
    expect(results[1].tool_use_id).toBe('b');
    expect(results[1].content).toMatch(/Skipped/);
    expect(auditLog.getLog().some((e) => e.command.type === 'press_key' && e.timestamp > Date.now() - 2000 && e.command.source === 'agent' && e.command.keyIndex === 1 && e.verdict === 'ACCEPTED')).toBe(false);
    expect(useAgentStore.getState().messages.some((m) => m.text === 'That point is out of reach.')).toBe(true);
  });

  it('answers state questions with get_state then a reply', async () => {
    vi.mocked(callLLM)
      .mockResolvedValueOnce({ content: [{ type: 'tool_use', id: 's', name: 'get_state', input: {} }] })
      .mockResolvedValueOnce({ content: [{ type: 'text', text: 'All joints are at zero.' }] });

    await runAgent('where is the arm?');

    const history = vi.mocked(callLLM).mock.calls[1][0] as any[];
    const results = history.filter((m) => m.role === 'user' && Array.isArray(m.content)).pop().content;
    const state = JSON.parse(results[0].content);
    expect(state.safety_mode).toBe('REST');
    expect(state.joints.joint_1_deg).toBe(0);
  });
});
