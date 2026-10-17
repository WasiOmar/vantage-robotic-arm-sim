import { auditLog } from '../../audit';
import { transcribeWithWhisper } from '../../utils/whisperClient';
import { startSilenceDetection, type SilenceDetectorHandle } from '../../utils/silenceDetector';
import { useStore } from '../../store';
import { executeUtterance, describeReason, type UtteranceOutcome } from './runUtterance';

export type VoiceState = 'listening' | 'transcribing' | 'executing' | 'idle' | 'error' | 'unsupported';

export interface Rejection {
  reason: string;
  raw: string;
  hint?: string;
}

export interface VoiceTrigger {
  startVoice(): Promise<void>;
  stopVoice(): void;
  /** Stop recording and throw the audio away. */
  cancelVoice(): void;
  getState(): VoiceState;
  onTranscript(cb: (partial: string, final: string) => void): Unsubscribe;
  onError(cb: (err: string) => void): Unsubscribe;
  onState(cb: (state: VoiceState) => void): Unsubscribe;
  onRejection(cb: (rejection: Rejection) => void): Unsubscribe;
  onVolume(cb: (volume: number) => void): Unsubscribe;
  /** Informational messages (e.g. "didn't hear anything"). */
  onNotice(cb: (msg: string) => void): Unsubscribe;
  /** Execution result of a voice utterance (VOICE mode only). */
  onResult(cb: (outcome: UtteranceOutcome) => void): Unsubscribe;
}

type Unsubscribe = () => void;

function getApiKey(): string {
  try {
    if (typeof localStorage !== 'undefined') {
      return localStorage.getItem('openai_api_key') || '';
    }
  } catch {
    // storage blocked
  }
  return '';
}

// Whisper invents these on near-silent clips; never treat them as commands.
const HALLUCINATIONS = /^(?:you|thank you|thanks|thanks for watching|thank you for watching|bye|okay|ok|so|um|uh|hmm|\.+|music|silence|\[.*\])[.!?]*$/i;

function friendlyMicError(err: unknown): string {
  const name = (err as { name?: string })?.name;
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'Microphone permission denied. Allow mic access in the browser address bar and try again.';
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') return 'No microphone found. Plug one in or use the text box.';
  if (name === 'NotReadableError') return 'Microphone is in use by another app.';
  return err instanceof Error ? err.message : String(err);
}

function pickMimeType(): string | undefined {
  const MR = (globalThis as any).MediaRecorder;
  if (!MR || typeof MR.isTypeSupported !== 'function') return undefined;
  for (const t of ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus']) {
    try {
      if (MR.isTypeSupported(t)) return t;
    } catch {
      // ignore
    }
  }
  return undefined;
}

function createVoiceTrigger(): VoiceTrigger {
  let mediaRecorder: MediaRecorder | null = null;
  let stream: MediaStream | null = null;
  let currentState: VoiceState = 'idle';
  let audioChunks: Blob[] = [];
  let starting = false;
  let busy = false;
  let discardNext = false;
  let silence: SilenceDetectorHandle | null = null;

  const stateListeners = new Set<(state: VoiceState) => void>();
  const transcriptListeners = new Set<(partial: string, final: string) => void>();
  const errorListeners = new Set<(err: string) => void>();
  const rejectionListeners = new Set<(rejection: Rejection) => void>();
  const volumeListeners = new Set<(volume: number) => void>();
  const noticeListeners = new Set<(msg: string) => void>();
  const resultListeners = new Set<(outcome: UtteranceOutcome) => void>();

  function emitState(state: VoiceState): void {
    currentState = state;
    stateListeners.forEach((cb) => cb(state));
  }
  const emitError = (msg: string) => errorListeners.forEach((cb) => cb(msg));
  const emitNotice = (msg: string) => noticeListeners.forEach((cb) => cb(msg));

  const supported = typeof window !== 'undefined' && !!navigator.mediaDevices && !!(window as any).MediaRecorder;
  if (!supported) currentState = 'unsupported';

  function releaseStream(): void {
    if (silence) {
      silence();
      silence = null;
    }
    stream?.getTracks().forEach((track) => track.stop());
    stream = null;
  }

  async function handleTranscript(text: string): Promise<void> {
    const trimmed = text.trim();
    if (!trimmed || HALLUCINATIONS.test(trimmed)) {
      emitNotice("Didn't catch that. Try again a little louder.");
      return;
    }

    transcriptListeners.forEach((cb) => cb('', trimmed));

    // Other modes (e.g. AGENTIC) consume the transcript themselves.
    if (useStore.getState().controlMode !== 'VOICE') return;

    emitState('executing');
    const outcome = await executeUtterance(trimmed, 'voice');
    resultListeners.forEach((cb) => cb(outcome));

    if (outcome.kind === 'not_understood') {
      rejectionListeners.forEach((cb) => cb({ reason: outcome.reason, raw: trimmed, hint: outcome.hint }));
      auditLog.append({
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        command: { id: crypto.randomUUID(), source: 'voice', type: 'moveTo', timestamp: Date.now() },
        verdict: 'REJECTED',
        reason: `PARSE_ERROR: ${outcome.reason}`,
      });
    } else if (outcome.kind === 'executed' && !outcome.ok) {
      const failed = outcome.steps.find((s) => s.verdict === 'REJECTED');
      if (failed) rejectionListeners.forEach((cb) => cb({ reason: describeReason(failed.reason), raw: trimmed }));
    }
  }

  async function processAudio(blob: Blob, hadSpeech: boolean): Promise<void> {
    if (!hadSpeech) {
      audioChunks = [];
      emitNotice("Didn't hear anything. Tap the mic and speak.");
      emitState('idle');
      return;
    }
    busy = true;
    try {
      emitState('transcribing');
      const text = await transcribeWithWhisper(blob, getApiKey());
      await handleTranscript(text);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      emitError(message);
      emitState('error');
      return;
    } finally {
      busy = false;
      audioChunks = [];
    }
    emitState('idle');
  }

  async function startVoice(): Promise<void> {
    if (!supported) {
      emitState('unsupported');
      return;
    }
    if (currentState === 'listening' || starting || busy) return;
    starting = true;
    discardNext = false;

    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      if (discardNext) {
        // cancelVoice() was called while the permission prompt was open.
        releaseStream();
        emitState('idle');
        return;
      }
      const mimeType = pickMimeType();
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      mediaRecorder = recorder;
      audioChunks = [];

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) audioChunks.push(event.data);
      };

      recorder.onstop = async () => {
        const hadSpeech = silence ? silence.hadSpeech() : true;
        releaseStream();
        mediaRecorder = null;
        if (discardNext || audioChunks.length === 0) {
          audioChunks = [];
          emitState('idle');
          return;
        }
        const blob = new Blob(audioChunks, { type: recorder.mimeType || mimeType || 'audio/webm' });
        await processAudio(blob, hadSpeech);
      };

      recorder.onerror = () => {
        releaseStream();
        mediaRecorder = null;
        emitError('Microphone recording failed.');
        emitState('error');
      };

      recorder.start();
      emitState('listening');

      silence = startSilenceDetection(stream, {
        onSilence: () => stopVoice(),
        onVolumeChange: (volume) => volumeListeners.forEach((cb) => cb(volume)),
        threshold: 0.02,
        silenceDuration: 1200,
        noSpeechTimeout: 7000,
        maxDuration: 15000,
      });
    } catch (err) {
      releaseStream();
      mediaRecorder = null;
      emitError(friendlyMicError(err));
      emitState('error');
    } finally {
      starting = false;
    }
  }

  function stopVoice(): void {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
      mediaRecorder.stop();
    }
  }

  function cancelVoice(): void {
    discardNext = true;
    if (mediaRecorder && mediaRecorder.state === 'recording') {
      mediaRecorder.stop();
    } else if (!starting) {
      releaseStream();
    }
  }

  function subscribe<T>(set: Set<T>, cb: T): Unsubscribe {
    set.add(cb);
    return () => {
      set.delete(cb);
    };
  }

  return {
    startVoice,
    stopVoice,
    cancelVoice,
    getState: () => currentState,
    onTranscript: (cb) => subscribe(transcriptListeners, cb),
    onError: (cb) => subscribe(errorListeners, cb),
    onState(cb) {
      stateListeners.add(cb);
      cb(currentState);
      return () => {
        stateListeners.delete(cb);
      };
    },
    onRejection: (cb) => subscribe(rejectionListeners, cb),
    onVolume: (cb) => subscribe(volumeListeners, cb),
    onNotice: (cb) => subscribe(noticeListeners, cb),
    onResult: (cb) => subscribe(resultListeners, cb),
  };
}

export const voiceTrigger = createVoiceTrigger();
