import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ArmCommand } from '../../types/commands';

function buildMockRecorder() {
  const instances: any[] = [];

  const mockStream = {
    getTracks: () => [{ stop: vi.fn() }],
  };

  const MockRecorder = vi.fn().mockImplementation(function () {
    const instance: any = {
      state: 'inactive',
      start: vi.fn(function (this: any) {
        this.state = 'recording';
        instances.push(this);
      }),
      stop: vi.fn(function (this: any) {
        this.state = 'inactive';
        if (typeof instance.ondataavailable === 'function') {
          instance.ondataavailable({ data: new Blob(['x'], { type: 'audio/webm' }) });
        }
        if (typeof instance.onstop === 'function') {
          Promise.resolve().then(() => instance.onstop());
        }
        return Promise.resolve();
      }),
      ondataavailable: null,
      onstop: null,
      onerror: null,
    };
    return instance;
  });

  return { MockRecorder, instances, mockStream };
}

function installGlobals(MockRecorder: ReturnType<typeof vi.fn>, mockStream: { getTracks: () => any[] }) {
  vi.stubGlobal('MediaRecorder', MockRecorder);

  Object.defineProperty((globalThis as any).navigator, 'mediaDevices', {
    value: {
      getUserMedia: vi.fn().mockResolvedValue(mockStream),
    },
    writable: true,
    configurable: true,
  });
}

function isArmCommandShape(obj: any): obj is ArmCommand {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    typeof obj.id === 'string' &&
    obj.source === 'voice' &&
    typeof obj.timestamp === 'number' &&
    typeof obj.type === 'string'
  );
}

describe('Voice -> gate (Whisper)', () => {
  let dispatchSpy: any;
  let submitSpy: any;
  let voiceTrigger: any;

  beforeEach(async () => {
    vi.resetModules();
    dispatchSpy = vi.fn();
    submitSpy = vi.fn();

    dispatchSpy.mockImplementation((cmd: ArmCommand) => {
      submitSpy(cmd);
    });

    vi.doMock('../../bus/commandBus', () => ({
      commandBus: {
        dispatch: dispatchSpy,
        submit: submitSpy,
      },
    }));

    vi.doMock('../../utils/whisperClient', () => ({
      transcribeWithWhisper: vi.fn().mockResolvedValue('jog joint 1 by 30 degrees'),
    }));

    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('openai_api_key', 'test-key');
    }

    Object.defineProperty(navigator, 'userAgent', {
      value: 'Mozilla/5.0',
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem('openai_api_key');
    }
  });

  it('dispatches valid utterances with source:"voice"', async () => {
    const { MockRecorder, mockStream } = buildMockRecorder();
    installGlobals(MockRecorder, mockStream);

    const { useStore } = await import('../../store');
    useStore.getState().setControlMode('VOICE');
    const mod = await import('./voiceTrigger');
    voiceTrigger = mod.voiceTrigger;

    let whisperCalls = 0;
    let lastError: string | null = null;
    voiceTrigger.onError((err: string) => { lastError = err; });
    voiceTrigger.onTranscript((_partial: string, final: string) => {
      whisperCalls += 1;
      console.log('transcript final:', final);
    });

    await voiceTrigger.startVoice();
    const rec = (globalThis as any).MediaRecorder.mock?.instances?.[0];
    expect(rec).toBeDefined();

    await rec.stop();
    console.log('after stop, lastError:', lastError, 'whisperCalls:', whisperCalls);

    if (lastError) {
      console.log('errors during test:', lastError);
    }

    await vi.waitFor(() => expect(dispatchSpy).toHaveBeenCalledTimes(1), { timeout: 4000 });
    const cmd = dispatchSpy.mock.calls[0]![0] as ArmCommand;
    expect(isArmCommandShape(cmd)).toBe(true);
    expect(cmd.source).toBe('voice');
  });
});
