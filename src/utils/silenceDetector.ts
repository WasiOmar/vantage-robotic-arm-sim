export type StopReason = 'silence' | 'no_speech' | 'max_duration';

export interface SilenceDetectorOptions {
  onSilence: (reason: StopReason) => void;
  onVolumeChange?: (volume: number) => void;
  /** Fired once, the first time the level crosses the speech threshold. */
  onSpeechStart?: () => void;
  threshold?: number; // RMS threshold (0.0 to 1.0)
  silenceDuration?: number; // ms of silence *after speech* before auto-stopping
  noSpeechTimeout?: number; // ms to wait for the operator to start talking
  maxDuration?: number; // hard cap on a single recording
}

export interface SilenceDetectorHandle {
  (): void;
  /** True once any speech-level audio was observed. */
  hadSpeech: () => boolean;
}

export function startSilenceDetection(stream: MediaStream, options: SilenceDetectorOptions): SilenceDetectorHandle {
  let audioContext: AudioContext | null = null;
  let source: MediaStreamAudioSourceNode | null = null;
  let analyser: AnalyserNode | null = null;
  let animationFrameId: number | null = null;
  let speechDetected = false;
  let stopped = false;

  const cleanup = (() => {
    stopped = true;
    if (animationFrameId !== null) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    }
    if (source) {
      source.disconnect();
      source = null;
    }
    if (analyser) {
      analyser.disconnect();
      analyser = null;
    }
    if (audioContext && audioContext.state !== 'closed') {
      audioContext.close().catch(() => {});
      audioContext = null;
    }
  }) as SilenceDetectorHandle;
  cleanup.hadSpeech = () => speechDetected;

  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass || typeof requestAnimationFrame === 'undefined') {
      console.warn('AudioContext is not supported in this browser.');
      speechDetected = true; // can't measure, so never discard the recording
      return cleanup;
    }

    audioContext = new AudioContextClass();
    // Some browsers create the context suspended until a gesture; the mic click counts.
    if (audioContext.state === 'suspended') audioContext.resume().catch(() => {});
    source = audioContext.createMediaStreamSource(stream);
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 512;
    source.connect(analyser);

    const bufferLength = analyser.fftSize;
    const dataArray = new Uint8Array(bufferLength);

    const startTime = Date.now();
    let lastSoundTime = startTime;
    const threshold = options.threshold ?? 0.02;
    const silenceDuration = options.silenceDuration ?? 1200;
    const noSpeechTimeout = options.noSpeechTimeout ?? 7000;
    const maxDuration = options.maxDuration ?? 15000;
    // Short smoothing window so one click or breath doesn't count as speech.
    let loudFrames = 0;

    const finish = (reason: StopReason) => {
      if (stopped) return;
      cleanup();
      options.onSilence(reason);
    };

    const check = () => {
      if (!analyser || stopped) return;

      analyser.getByteTimeDomainData(dataArray);
      let sumSquares = 0;
      for (let i = 0; i < bufferLength; i++) {
        const normalized = (dataArray[i] - 128) / 128;
        sumSquares += normalized * normalized;
      }
      const rms = Math.sqrt(sumSquares / bufferLength);
      options.onVolumeChange?.(rms);

      const now = Date.now();
      if (rms > threshold) {
        loudFrames++;
        lastSoundTime = now;
        if (!speechDetected && loudFrames >= 3) {
          speechDetected = true;
          options.onSpeechStart?.();
        }
      } else {
        loudFrames = 0;
      }

      if (now - startTime > maxDuration) return finish('max_duration');
      if (!speechDetected && now - startTime > noSpeechTimeout) return finish('no_speech');
      if (speechDetected && now - lastSoundTime > silenceDuration) return finish('silence');

      animationFrameId = requestAnimationFrame(check);
    };

    check();
  } catch (err) {
    console.error('Failed to start silence detection:', err);
    speechDetected = true;
  }

  return cleanup;
}
