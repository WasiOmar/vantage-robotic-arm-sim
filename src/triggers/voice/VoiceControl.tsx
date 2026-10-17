import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Mic, Square, LoaderCircle, Send, Settings, ChevronDown, ChevronRight, CircleCheck, CircleX,
  CircleMinus, TriangleAlert, RotateCcw, Radio, Info, X, Keyboard,
} from 'lucide-react';
import { voiceTrigger, type VoiceState } from './voiceTrigger';
import { executeUtterance, describeReason, VOICE_EXAMPLES, type UtteranceOutcome } from './runUtterance';
import { useStore } from '../../store';
import { commandBus } from '../../bus/commandBus';

interface HistoryItem {
  id: string;
  via: 'voice' | 'typed';
  outcome: UtteranceOutcome;
}

const STATUS_LABEL: Record<VoiceState, string> = {
  idle: 'Ready',
  listening: 'Listening…',
  transcribing: 'Transcribing…',
  executing: 'Executing…',
  error: 'Error',
  unsupported: 'Mic unavailable',
};

function readKey(): string {
  try {
    return localStorage.getItem('openai_api_key') || '';
  } catch {
    return '';
  }
}

function isTypingTarget(el: EventTarget | null): boolean {
  const tag = (el as HTMLElement | null)?.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'BUTTON' || !!(el as HTMLElement | null)?.isContentEditable;
}

function OutcomeView({ outcome }: { outcome: UtteranceOutcome }) {
  if (outcome.kind === 'help') return <div className="vx-note">Opened the command guide below.</div>;
  if (outcome.kind === 'nothing_to_repeat') return <div className="vx-note">Nothing to repeat yet.</div>;
  if (outcome.kind === 'not_understood') {
    return (
      <div className="vx-note vx-note--warn">
        <strong>Not understood.</strong> {outcome.reason === 'Unrecognized command' ? '' : `${outcome.reason}. `}
        {outcome.hint}
      </div>
    );
  }
  return (
    <div className="vx-steps">
      {outcome.steps.map((s) => (
        <span key={s.command.id} className={`vx-step vx-step--${s.verdict.toLowerCase()}`} title={s.reason ? describeReason(s.reason) : undefined}>
          {s.verdict === 'ACCEPTED' && <CircleCheck size={12} />}
          {s.verdict === 'REJECTED' && <CircleX size={12} />}
          {s.verdict === 'SKIPPED' && <CircleMinus size={12} />}
          {s.label}
        </span>
      ))}
      {outcome.steps.some((s) => s.verdict === 'REJECTED') && (
        <div className="vx-note vx-note--error">
          {describeReason(outcome.steps.find((s) => s.verdict === 'REJECTED')?.reason)}
        </div>
      )}
    </div>
  );
}

const VoiceControl = () => {
  const mode = useStore((s) => s.mode);
  const controlMode = useStore((s) => s.controlMode);
  const addLog = useStore((s) => s.addLog);

  const [state, setState] = useState<VoiceState>(voiceTrigger.getState());
  const [volume, setVolume] = useState(0);
  const [heard, setHeard] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [text, setText] = useState('');
  const [typedBusy, setTypedBusy] = useState(false);
  const [handsFree, setHandsFree] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [apiKey, setApiKey] = useState(readKey);

  const handsFreeRef = useRef(handsFree);
  handsFreeRef.current = handsFree;
  const restartTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const pushHistory = useCallback((via: HistoryItem['via'], outcome: UtteranceOutcome) => {
    if (outcome.kind === 'help') setShowGuide(true);
    setHistory((prev) => [{ id: crypto.randomUUID(), via, outcome }, ...prev].slice(0, 8));
  }, []);

  useEffect(() => {
    const unsubs = [
      voiceTrigger.onState((s) => {
        setState(s);
        if (s !== 'listening') setVolume(0);
        if (s === 'listening') {
          setError(null);
          setNotice(null);
        }
        if (s === 'error') setHandsFree(false);
        // Hands-free: re-open the mic once the previous utterance has finished.
        if (s === 'idle' && handsFreeRef.current && useStore.getState().controlMode === 'VOICE') {
          if (restartTimer.current) clearTimeout(restartTimer.current);
          restartTimer.current = setTimeout(() => {
            if (handsFreeRef.current && useStore.getState().mode !== 'STOP') voiceTrigger.startVoice();
          }, 450);
        }
      }),
      voiceTrigger.onVolume(setVolume),
      voiceTrigger.onTranscript((_p, final) => {
        if (!final) return;
        setHeard(final);
        addLog({ source: 'voice', type: 'info', message: `Recognized: "${final}"` });
      }),
      voiceTrigger.onError((e) => setError(e)),
      voiceTrigger.onNotice((n) => setNotice(n)),
      voiceTrigger.onResult((outcome) => {
        pushHistory('voice', outcome);
        if (outcome.kind === 'executed') {
          addLog({
            source: 'voice',
            type: outcome.ok ? 'success' : 'error',
            message: outcome.steps.map((s) => `${s.label}: ${s.verdict}`).join(' → '),
          });
        } else if (outcome.kind === 'not_understood') {
          addLog({ source: 'voice', type: 'warn', message: `Not understood: "${outcome.text}"` });
        }
      }),
    ];
    return () => {
      unsubs.forEach((u) => u());
      if (restartTimer.current) clearTimeout(restartTimer.current);
    };
  }, [addLog, pushHistory]);

  // Leaving voice mode must release the microphone.
  useEffect(() => () => voiceTrigger.cancelVoice(), []);

  // An E-stop ends hands-free listening; the operator should re-engage deliberately.
  useEffect(() => {
    if (mode === 'STOP') setHandsFree(false);
  }, [mode]);

  const toggleMic = useCallback(() => {
    if (state === 'transcribing' || state === 'executing') return;
    if (state === 'listening') {
      voiceTrigger.stopVoice();
    } else {
      setError(null);
      setNotice(null);
      voiceTrigger.startVoice();
    }
  }, [state]);

  // Space = push to talk, Esc = cancel (only when not typing).
  useEffect(() => {
    if (controlMode !== 'VOICE') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || isTypingTarget(e.target)) return;
      if (e.code === 'Space') {
        e.preventDefault();
        toggleMic();
      } else if (e.key === 'Escape' && voiceTrigger.getState() === 'listening') {
        handsFreeRef.current = false;
        setHandsFree(false);
        voiceTrigger.cancelVoice();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [controlMode, toggleMic]);

  const runTyped = useCallback(async (value: string) => {
    const trimmed = value.trim();
    if (!trimmed || typedBusy) return;
    setTypedBusy(true);
    setText('');
    setError(null);
    setNotice(null);
    setHeard(trimmed);
    try {
      const outcome = await executeUtterance(trimmed, 'typed');
      pushHistory('typed', outcome);
    } finally {
      setTypedBusy(false);
    }
  }, [typedBusy, pushHistory]);

  const resetStop = () => {
    commandBus.dispatch({ id: crypto.randomUUID(), source: 'voice', type: 'reset', timestamp: Date.now() });
  };

  const saveKey = (value: string) => {
    setApiKey(value);
    try {
      if (value) localStorage.setItem('openai_api_key', value);
      else localStorage.removeItem('openai_api_key');
    } catch {
      // storage blocked: key lives only for this session
    }
  };

  const busy = state === 'transcribing' || state === 'executing' || typedBusy;
  const ring = state === 'listening' ? 1 + Math.min(1, volume * 9) * 0.35 : 1;
  const latest = history[0];

  return (
    <div className="vx-panel">
      <div className="vx-toolbar">
        <span className={`vx-status vx-status--${state}`}>
          <span className="vx-dot" />
          {STATUS_LABEL[state]}
        </span>
        <div className="vx-toolbar-actions">
          <button
            type="button"
            className={`vx-chip-toggle ${handsFree ? 'is-on' : ''}`}
            onClick={() => {
              const next = !handsFree;
              handsFreeRef.current = next;
              setHandsFree(next);
              if (next && state === 'idle') voiceTrigger.startVoice();
              if (!next && state === 'listening') voiceTrigger.cancelVoice();
            }}
            disabled={state === 'unsupported' || mode === 'STOP'}
            aria-pressed={handsFree}
            title="Keep listening after each command"
          >
            <Radio size={13} /> Hands-free
          </button>
          <button
            type="button"
            className={`vx-icon-btn ${showSettings ? 'is-on' : ''}`}
            onClick={() => setShowSettings((v) => !v)}
            title="Transcription settings"
            aria-label="Transcription settings"
          >
            <Settings size={15} />
          </button>
        </div>
      </div>

      {showSettings && (
        <div className="vx-settings">
          <label htmlFor="vx-key">OpenAI key for Whisper (optional)</label>
          <input
            id="vx-key"
            type="password"
            value={apiKey}
            onChange={(e) => saveKey(e.target.value)}
            placeholder="sk-… (leave empty to use the server key)"
            autoComplete="off"
          />
          <span>Stored only in this browser. Empty = use the server's /api/transcribe.</span>
        </div>
      )}

      {mode === 'STOP' && (
        <div className="vx-banner vx-banner--stop">
          <TriangleAlert size={16} />
          <span>Emergency stop is active. Commands are blocked.</span>
          <button type="button" className="vx-btn vx-btn--small" onClick={resetStop}>
            <RotateCcw size={13} /> Reset
          </button>
        </div>
      )}

      <div className="vx-mic-wrap">
        <button
          type="button"
          className={`vx-mic vx-mic--${state}`}
          onClick={toggleMic}
          disabled={state === 'unsupported' || busy}
          aria-label={state === 'listening' ? 'Stop listening' : 'Start listening'}
          style={{ ['--vx-ring' as string]: ring }}
        >
          <span className="vx-mic-ring" />
          {state === 'listening' ? <Square size={30} fill="currentColor" /> : busy ? <LoaderCircle size={34} className="spin-fast" /> : <Mic size={36} />}
        </button>
        <div className="vx-mic-caption">
          {state === 'listening' && 'Speak now. Stops automatically when you pause.'}
          {state === 'transcribing' && 'Converting speech to text…'}
          {state === 'executing' && 'Running command…'}
          {(state === 'idle' || state === 'error') && !typedBusy && (
            <>Tap the mic or press <kbd>Space</kbd></>
          )}
          {typedBusy && 'Running command…'}
          {state === 'unsupported' && 'This browser cannot record audio. Use the text box.'}
        </div>
      </div>

      <div className="vx-heard" aria-live="polite">
        <div className="vx-label">Heard</div>
        <div className={heard ? 'vx-heard-text' : 'vx-heard-empty'}>{heard ? `“${heard}”` : 'Waiting for a command…'}</div>
        {latest && <OutcomeView outcome={latest.outcome} />}
      </div>

      {error && (
        <div className="vx-banner vx-banner--error" role="alert">
          <CircleX size={15} />
          <span>{error}</span>
          <button type="button" className="vx-icon-btn" onClick={() => setError(null)} aria-label="Dismiss"><X size={13} /></button>
        </div>
      )}
      {notice && !error && (
        <div className="vx-banner vx-banner--info">
          <Info size={15} />
          <span>{notice}</span>
        </div>
      )}

      <form
        className="vx-input-row"
        onSubmit={(e) => {
          e.preventDefault();
          runTyped(text);
        }}
      >
        <Keyboard size={14} className="vx-input-icon" />
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Or type: press key 3 then go home"
          aria-label="Type a voice command"
        />
        <button type="submit" className="vx-btn vx-btn--primary" disabled={!text.trim() || typedBusy} aria-label="Run command">
          <Send size={14} />
        </button>
      </form>

      {history.length > 1 && (
        <div className="vx-history">
          <div className="vx-label">Recent</div>
          {history.slice(1, 6).map((h) => {
            const ok = h.outcome.kind === 'executed' && h.outcome.ok;
            const bad = h.outcome.kind === 'not_understood' || (h.outcome.kind === 'executed' && !h.outcome.ok);
            return (
              <button
                key={h.id}
                type="button"
                className="vx-history-row"
                onClick={() => runTyped(h.outcome.text)}
                disabled={busy}
                title="Run again"
              >
                {ok ? <CircleCheck size={13} className="vx-ok" /> : bad ? <CircleX size={13} className="vx-bad" /> : <Info size={13} />}
                <span className="vx-history-text">{h.outcome.text}</span>
                <span className="vx-history-via">{h.via === 'voice' ? <Mic size={11} /> : <Keyboard size={11} />}</span>
              </button>
            );
          })}
        </div>
      )}

      <div className="vx-guide">
        <button type="button" className="vx-guide-toggle" onClick={() => setShowGuide((v) => !v)} aria-expanded={showGuide}>
          {showGuide ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          What can I say?
        </button>
        {showGuide && (
          <div className="vx-guide-body">
            {VOICE_EXAMPLES.map((g) => (
              <div key={g.group} className="vx-guide-group">
                <div className="vx-label">{g.group}</div>
                <div className="vx-chips">
                  {g.phrases.map((p) => (
                    <button key={p} type="button" className="vx-chip" onClick={() => runTyped(p)} disabled={busy} title="Click to run">
                      {p}
                    </button>
                  ))}
                </div>
              </div>
            ))}
            <div className="vx-guide-foot">
              Joints: base = 1, shoulder = 2, elbow = 3, wrist roll = 4, wrist = 5, wrist yaw = 6. Distances default to cm.
              Chain steps with “then”.
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default VoiceControl;
