import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Bot, Mic, Square, Send, LoaderCircle, CircleCheck, CircleX, CircleMinus, Volume2, VolumeX,
  Trash2, TriangleAlert, RotateCcw, Info, X, Sparkles, OctagonX,
} from 'lucide-react';
import { useAgentStore, type AgentMessage } from './agentStore';
import { runAgent, cancelAgent, resetConversation } from './agent';
import { probeLLM } from './llmClient';
import { DEMO_PROMPTS } from './demoPrompts';
import { cancel as cancelSpeech } from './tts';
import { voiceTrigger, type VoiceState } from '../triggers/voice/voiceTrigger';
import { useStore } from '../store';
import { commandBus } from '../bus/commandBus';

const LLM_LABEL = {
  checking: 'Connecting…',
  online: 'Claude online',
  offline: 'LLM offline · local parser',
  'no-key': 'No API key · local parser',
} as const;

function StepRow({ msg }: { msg: AgentMessage }) {
  const icon =
    msg.status === 'running' ? <LoaderCircle size={14} className="spin-fast" /> :
    msg.status === 'done' ? <CircleCheck size={14} /> :
    msg.status === 'rejected' ? <CircleX size={14} /> :
    <CircleMinus size={14} />;
  return (
    <div className={`ag-step ag-step--${msg.status ?? 'done'}`}>
      {icon}
      <div>
        <div className="ag-step-label">{msg.text}</div>
        {msg.detail && <div className="ag-step-detail">{msg.detail}</div>}
      </div>
    </div>
  );
}

function MessageView({ msg }: { msg: AgentMessage }) {
  if (msg.type === 'tool_call') return <StepRow msg={msg} />;
  if (msg.sender === 'user') return <div className="ag-bubble ag-bubble--user">{msg.text}</div>;
  if (msg.type === 'clarify') {
    return (
      <div className="ag-bubble ag-bubble--clarify">
        <div className="ag-bubble-tag">Question</div>
        {msg.text}
      </div>
    );
  }
  if (msg.type === 'rejection') {
    return (
      <div className="ag-bubble ag-bubble--error">
        {msg.text}
        {msg.detail && <div className="ag-step-detail">{msg.detail}</div>}
      </div>
    );
  }
  if (msg.sender === 'system' || msg.type === 'info') {
    return (
      <div className="ag-info">
        <Info size={12} /> {msg.text}
      </div>
    );
  }
  return <div className="ag-bubble ag-bubble--agent">{msg.text}</div>;
}

const AgentPanel = () => {
  const {
    messages, isThinking, isExecuting, error, speakResult, waitingForClarification, llmStatus,
    setSpeakResult, clearMessages, setError, setLlmStatus,
  } = useAgentStore();
  const mode = useStore((s) => s.mode);

  const [text, setText] = useState('');
  const [micState, setMicState] = useState<VoiceState>(voiceTrigger.getState());
  const [volume, setVolume] = useState(0);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [voiceNotice, setVoiceNotice] = useState<string | null>(null);
  const [sent, setSent] = useState<string[]>([]);
  const recallIndex = useRef(-1);
  const logRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const busy = isThinking || isExecuting;

  const checkLLM = useCallback(async () => {
    setLlmStatus('checking');
    setLlmStatus(await probeLLM());
  }, [setLlmStatus]);

  useEffect(() => {
    if (useAgentStore.getState().llmStatus === 'checking') checkLLM();
  }, [checkLLM]);

  // Keep the newest message in view.
  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, isThinking, isExecuting, waitingForClarification]);

  useEffect(() => {
    if (waitingForClarification) inputRef.current?.focus();
  }, [waitingForClarification]);

  const submit = useCallback(async (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    if (busy && !waitingForClarification) return;
    setText('');
    recallIndex.current = -1;
    setSent((prev) => [trimmed, ...prev.filter((p) => p !== trimmed)].slice(0, 20));
    await runAgent(trimmed);
  }, [busy, waitingForClarification]);

  // Voice input goes through the shared voice trigger (silence detection, Whisper).
  const submitRef = useRef(submit);
  submitRef.current = submit;
  useEffect(() => {
    const unsubs = [
      voiceTrigger.onState((s) => {
        setMicState(s);
        if (s !== 'listening') setVolume(0);
        if (s === 'listening') {
          setVoiceError(null);
          setVoiceNotice(null);
        }
      }),
      voiceTrigger.onVolume(setVolume),
      voiceTrigger.onError(setVoiceError),
      voiceTrigger.onNotice(setVoiceNotice),
      voiceTrigger.onTranscript((_p, final) => {
        if (final && useStore.getState().controlMode === 'AGENTIC') submitRef.current(final);
      }),
    ];
    return () => {
      unsubs.forEach((u) => u());
      voiceTrigger.cancelVoice();
    };
  }, []);

  const toggleMic = () => {
    if (micState === 'listening') voiceTrigger.stopVoice();
    else if (micState !== 'transcribing') voiceTrigger.startVoice();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowUp' && sent.length > 0 && (!text || recallIndex.current >= 0)) {
      e.preventDefault();
      recallIndex.current = Math.min(sent.length - 1, recallIndex.current + 1);
      setText(sent[recallIndex.current]);
    } else if (e.key === 'ArrowDown' && recallIndex.current >= 0) {
      e.preventDefault();
      recallIndex.current -= 1;
      setText(recallIndex.current >= 0 ? sent[recallIndex.current] : '');
    } else if (e.key === 'Escape') {
      if (busy || waitingForClarification) cancelAgent();
      else setText('');
    }
  };

  const clearAll = () => {
    resetConversation();
    clearMessages();
    cancelSpeech();
  };

  const resetStop = () => {
    commandBus.dispatch({ id: crypto.randomUUID(), source: 'agent', type: 'reset', timestamp: Date.now() });
  };

  const micBusy = micState === 'transcribing' || micState === 'executing';
  const inputLocked = busy && !waitingForClarification;
  const ring = micState === 'listening' ? 1 + Math.min(1, volume * 9) * 0.45 : 1;
  const displayError = error || voiceError;

  let statusText = 'Ready';
  if (isThinking) statusText = 'Planning…';
  else if (isExecuting) statusText = 'Executing…';
  else if (waitingForClarification) statusText = 'Waiting for your answer';
  else if (micState === 'listening') statusText = 'Listening…';
  else if (micState === 'transcribing') statusText = 'Transcribing…';

  return (
    <div className="ag-panel">
      <div className="vx-toolbar">
        <span className={`vx-status ag-llm ag-llm--${llmStatus}`} title={llmStatus === 'online' ? 'Model: Claude Opus 5.5' : 'Commands still work through the built-in parser'}>
          <span className="vx-dot" />
          {LLM_LABEL[llmStatus]}
          {(llmStatus === 'offline' || llmStatus === 'no-key') && (
            <button type="button" className="ag-link" onClick={checkLLM}>retry</button>
          )}
        </span>
        <div className="vx-toolbar-actions">
          <button
            type="button"
            className={`vx-icon-btn ${speakResult ? 'is-on' : ''}`}
            onClick={() => {
              setSpeakResult(!speakResult);
              if (speakResult) cancelSpeech();
            }}
            aria-pressed={speakResult}
            title={speakResult ? 'Spoken replies on' : 'Spoken replies off'}
            aria-label="Toggle spoken replies"
          >
            {speakResult ? <Volume2 size={15} /> : <VolumeX size={15} />}
          </button>
          <button type="button" className="vx-icon-btn" onClick={clearAll} title="Clear conversation" aria-label="Clear conversation">
            <Trash2 size={15} />
          </button>
        </div>
      </div>

      {mode === 'STOP' && (
        <div className="vx-banner vx-banner--stop">
          <TriangleAlert size={16} />
          <span>Emergency stop is active. The agent can't move the arm.</span>
          <button type="button" className="vx-btn vx-btn--small" onClick={resetStop}>
            <RotateCcw size={13} /> Reset
          </button>
        </div>
      )}

      <div className="ag-log" ref={logRef} aria-live="polite">
        {messages.length === 0 && !busy && (
          <div className="ag-empty">
            <Bot size={28} />
            <div className="ag-empty-title">Tell the arm what to do</div>
            <div className="ag-empty-sub">Plain language works: sequences, PINs, relative moves, questions about the arm.</div>
          </div>
        )}
        {messages.map((m) => <MessageView key={m.id} msg={m} />)}
        {isThinking && (
          <div className="ag-thinking">
            <span className="ag-dots"><i /><i /><i /></span> Planning
          </div>
        )}
      </div>

      {displayError && (
        <div className="vx-banner vx-banner--error" role="alert">
          <CircleX size={15} />
          <span>{displayError}</span>
          <button type="button" className="vx-icon-btn" onClick={() => { setError(null); setVoiceError(null); }} aria-label="Dismiss">
            <X size={13} />
          </button>
        </div>
      )}
      {voiceNotice && !displayError && (
        <div className="vx-banner vx-banner--info">
          <Info size={15} />
          <span>{voiceNotice}</span>
        </div>
      )}

      {!busy && !waitingForClarification && (
        <div className="ag-suggestions">
          <Sparkles size={12} className="ag-suggest-icon" />
          {DEMO_PROMPTS.map((dp) => (
            <button key={dp.label} type="button" className="vx-chip" onClick={() => submit(dp.text)} title={dp.text}>
              {dp.label}
            </button>
          ))}
        </div>
      )}

      <form
        className={`ag-input ${waitingForClarification ? 'is-clarifying' : ''}`}
        onSubmit={(e) => {
          e.preventDefault();
          submit(text);
        }}
      >
        <button
          type="button"
          className={`ag-mic ${micState === 'listening' ? 'is-live' : ''}`}
          onClick={toggleMic}
          disabled={micState === 'unsupported' || micBusy || inputLocked}
          title={micState === 'listening' ? 'Stop and send' : 'Speak your request'}
          aria-label={micState === 'listening' ? 'Stop recording' : 'Start voice input'}
          style={{ ['--vx-ring' as string]: ring }}
        >
          <span className="vx-mic-ring" />
          {micState === 'listening' ? <Square size={13} fill="currentColor" /> : micBusy ? <LoaderCircle size={15} className="spin-fast" /> : <Mic size={16} />}
        </button>
        <input
          ref={inputRef}
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={inputLocked}
          placeholder={
            waitingForClarification ? 'Answer the question…' :
            micState === 'listening' ? 'Listening…' :
            'e.g. Press key 3 then go home'
          }
          aria-label="Message the agent"
        />
        {busy && !waitingForClarification ? (
          <button type="button" className="vx-btn vx-btn--danger" onClick={cancelAgent} title="Cancel (Esc)" aria-label="Cancel">
            <OctagonX size={15} />
          </button>
        ) : (
          <button type="submit" className="vx-btn vx-btn--primary" disabled={!text.trim()} aria-label="Send">
            <Send size={14} />
          </button>
        )}
      </form>
      <div className="ag-foot">
        <span>{statusText}</span>
        <span><kbd>Enter</kbd> send · <kbd>↑</kbd> recall · <kbd>Esc</kbd> cancel</span>
      </div>
    </div>
  );
};

export default AgentPanel;
