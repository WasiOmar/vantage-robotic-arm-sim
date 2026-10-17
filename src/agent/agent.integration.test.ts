import { vi, describe, it, expect, beforeEach } from 'vitest';
import { runAgent } from './agent';
import { useAgentStore } from './agentStore';
import { commandBus } from '../bus/commandBus';
import { auditLog } from '../audit';
import { useStore } from '../store';
import { fsm } from '../fsm';
import { callLLM } from './llmClient';

vi.mock('./llmClient', () => ({
  callLLM: vi.fn(),
}));

describe('Agent Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAgentStore.getState().clearMessages();
    useAgentStore.getState().setError(null);
    useAgentStore.getState().setThinking(false);
    useAgentStore.getState().setWaitingForClarification(false);

    // Reset simulator store and FSM states
    useStore.getState().resetEStop();
    fsm.reset();
    fsm.transitionTo('REST');

    // Stub global fetch to prevent actual network calls during tests (e.g. for key.config.json)
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          keys: {
            '1': { x: 0.5, y: 0.05, z: 0.05 },
            '2': { x: 0.55, y: 0.05, z: 0.05 },
            '3': { x: 0.6, y: 0.05, z: 0.05 },
            '4': { x: 0.5, y: -0.05, z: 0.05 },
            '5': { x: 0.55, y: -0.05, z: 0.05 },
            '6': { x: 0.6, y: -0.05, z: 0.05 },
          },
        }),
      })
    );
  });

  it('Case A: agent proposes press_key(3) -> gate approves -> audit shows source: agent', async () => {
    const dispatchSpy = vi.spyOn(commandBus, 'dispatch');

    vi.mocked(callLLM).mockResolvedValue({
      content: [
        {
          type: 'tool_use',
          id: 'tool_1',
          name: 'press_key',
          input: { keyIndex: 3 },
        },
      ],
    });

    await runAgent('Press key 3');

    expect(dispatchSpy).toHaveBeenCalled();
    const lastAuditEntry = auditLog.getLog().slice(-1)[0];
    expect(lastAuditEntry).toBeDefined();
    expect(lastAuditEntry.command.type).toBe('press_key');
    expect(lastAuditEntry.command.keyIndex).toBe(3);
    expect(lastAuditEntry.command.source).toBe('agent');
    expect(lastAuditEntry.verdict).toBe('ACCEPTED');
  });

  it('Case B: agent proposes goto with coords outside reach sphere -> gate rejects -> retries with clarify() -> user replies -> gate approves', async () => {
    // Attempt 1: proposes coordinates outside reach -> rejected
    vi.mocked(callLLM).mockResolvedValueOnce({
      content: [
        {
          type: 'tool_use',
          id: 'tool_unreachable',
          name: 'goto',
          input: { target: { x: 1.5, y: 0.0, z: 0.3 } },
        },
      ],
    });

    // Attempt 2: receives rejection, asks clarifying question
    vi.mocked(callLLM).mockResolvedValueOnce({
      content: [
        {
          type: 'tool_use',
          id: 'tool_clarify',
          name: 'clarify',
          input: { question: 'Target is unreachable. Where should I go instead?' },
        },
      ],
    });

    // Attempt 3: receives user response and goes to home (valid coordinate)
    vi.mocked(callLLM).mockResolvedValueOnce({
      content: [
        {
          type: 'tool_use',
          id: 'tool_home',
          name: 'goto',
          input: { targetName: 'home' },
        },
      ],
    });

    const agentPromise = runAgent('Go to the target at x=1.5');

    // Wait a brief moment to allow agent loop to execute and wait for clarification
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Confirm that the agent is waiting for user clarification
    expect(useAgentStore.getState().waitingForClarification).toBe(true);
    expect(useAgentStore.getState().messages.some((m) => m.type === 'clarify')).toBe(true);

    // Provide user reply (which calls supplyUserReply internally)
    await runAgent('Just go home instead');

    // Wait for the agent loop to finish execution
    await agentPromise;

    expect(useAgentStore.getState().error).toBeNull();
    expect(useAgentStore.getState().waitingForClarification).toBe(false);
    
    // Verify that the user response was added to the history
    expect(useAgentStore.getState().messages.some((m) => m.text === 'Just go home instead')).toBe(true);

    const logs = auditLog.getLog();

    // Verify rejection of first command
    const rejectedLog = logs.find((l) => l.command.type === 'moveTo' && l.verdict === 'REJECTED');
    expect(rejectedLog).toBeDefined();
    expect(rejectedLog?.reason).toBe('UNREACHABLE_TARGET');

    // Verify acceptance of final command
    const acceptedLog = logs.find((l) => l.command.type === 'goto' && l.verdict === 'ACCEPTED');
    expect(acceptedLog).toBeDefined();
    expect(acceptedLog?.command.targetName).toBe('home');
  });

  it('Case C: agent tries estop -> executor latches FAULT/STOP -> agent cannot un-latch', async () => {
    // Reset callLLM mock implementation to prevent fallback to Case A mock
    vi.mocked(callLLM).mockReset();
    
    vi.mocked(callLLM).mockResolvedValueOnce({
      content: [
        {
          type: 'tool_use',
          id: 'tool_estop',
          name: 'estop',
          input: {},
        },
      ],
    });

    // Execute E-Stop command
    await runAgent('E-Stop now!');

    expect(fsm.getState()).toBe('STOP');
    expect(useStore.getState().isEStop).toBe(true);

    // Now if agent tries to propose another command, it will be rejected by FSM
    vi.mocked(callLLM).mockResolvedValueOnce({
      content: [
        {
          type: 'tool_use',
          id: 'tool_goto_home',
          name: 'goto',
          input: { targetName: 'home' },
        },
      ],
    });

    await runAgent('Go home');

    const lastAuditEntry = auditLog.getLog().slice(-1)[0];
    expect(lastAuditEntry).toBeDefined();
    expect(lastAuditEntry.command.type).toBe('goto');
    expect(lastAuditEntry.verdict).toBe('REJECTED');
    expect(lastAuditEntry.reason).toBe('FSM_REJECTED');
    expect(fsm.getState()).toBe('STOP'); // still latched in STOP
  });
});
