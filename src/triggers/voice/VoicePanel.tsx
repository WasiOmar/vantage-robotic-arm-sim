import { useState, useEffect, useRef, useCallback } from 'react';
import { voiceTrigger, type VoiceState } from './voiceTrigger';

interface Rejection {
  reason: string;
  raw: string;
}

interface VoicePanelProps {
  onTranscript?: (partial: string, final: string) => void;
  onRejection?: (rejection: Rejection) => void;
  onState?: (state: VoiceState) => void;
}

const VoicePanelInner = ({ onTranscript, onRejection, onState }: VoicePanelProps) => {
  const [listening, setListening] = useState(false);
  const [transcripts, setTranscripts] = useState<{ partial: string; final: string }[]>([]);
  const [rejection, setRejection] = useState<Rejection | null>(null);
  const [state, setState] = useState<VoiceState>('idle');
  const [volume, setVolume] = useState(0);
  const [apiKey, setApiKey] = useState(() => {
    if (typeof localStorage !== 'undefined') {
      return localStorage.getItem('openai_api_key') || '';
    }
    return '';
  });
  const [showApiKeyInput, setShowApiKeyInput] = useState(false);
  const rejectionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const transcriptEndRef = useRef<HTMLDivElement>(null);

  const onTranscriptRef = useRef(onTranscript);
  const onRejectionRef = useRef(onRejection);
  const onStateRef = useRef(onState);

  useEffect(() => {
    onTranscriptRef.current = onTranscript;
  }, [onTranscript]);

  useEffect(() => {
    onRejectionRef.current = onRejection;
  }, [onRejection]);

  useEffect(() => {
    onStateRef.current = onState;
  }, [onState]);

  const clearRejectionTimer = useCallback(() => {
    if (rejectionTimerRef.current) {
      clearTimeout(rejectionTimerRef.current);
      rejectionTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    const unsubTranscript = voiceTrigger.onTranscript((partial, final) => {
      setTranscripts((prev) => {
        const next = [...prev];
        if (final) next.push({ partial: '', final });
        return next.slice(-50);
      });
      onTranscriptRef.current?.(partial, final);
    });

    const unsubRejection = voiceTrigger.onRejection((rej) => {
      clearRejectionTimer();
      setRejection(rej);
      rejectionTimerRef.current = setTimeout(() => {
        setRejection(null);
        rejectionTimerRef.current = null;
      }, 4000);
      onRejectionRef.current?.(rej);
    });

    const unsubState = voiceTrigger.onState((s) => {
      setState(s);
      setListening(s === 'listening');
      if (s !== 'listening') setVolume(0);
      onStateRef.current?.(s);
    });

    const unsubVolume = voiceTrigger.onVolume((vol) => {
      setVolume(vol);
    });

    return () => {
      unsubTranscript();
      unsubRejection();
      unsubState();
      unsubVolume();
      clearRejectionTimer();
    };
  }, [clearRejectionTimer]);

  const toggle = useCallback(() => {
    if (listening) {
      voiceTrigger.stopVoice();
    } else {
      voiceTrigger.startVoice();
    }
  }, [listening]);

  const handleApiKeyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setApiKey(value);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('openai_api_key', value);
    }
  };

  return (
    <div
      style={{
        background: 'rgba(0,0,0,0.7)',
        borderRadius: '8px',
        padding: '12px',
        minWidth: '260px',
        maxWidth: '320px',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        fontFamily: 'sans-serif',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <button
          onClick={toggle}
          disabled={state === 'unsupported' || state === 'transcribing'}
          style={{
            background: state === 'transcribing' ? '#eab308' : (listening ? '#ef4444' : '#22c55e'),
            border: 'none',
            borderRadius: '50%',
            width: '40px',
            height: '40px',
            cursor: (state === 'unsupported' || state === 'transcribing') ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'white',
            fontSize: '18px',
            flexShrink: 0,
          }}
          title={state === 'transcribing' ? 'Transcribing...' : (listening ? 'Stop voice' : 'Start voice')}
        >
          {state === 'transcribing' ? '⏳' : (listening ? '■' : '🎤')}
        </button>
        <span
          style={{
            fontSize: '12px',
            opacity: 0.7,
            fontFamily: 'monospace',
          }}
        >
          {state.toUpperCase()}
        </span>
        {state === 'listening' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '2px', height: '14px', flex: 1, marginLeft: '4px' }}>
            {[1, 2, 3, 4, 5].map((barIndex) => {
              const scale = 0.2 + volume * 1.8;
              const height = Math.min(100, Math.max(15, barIndex * 15 * scale));
              return (
                <div
                  key={barIndex}
                  style={{
                    width: '3px',
                    height: `${height}%`,
                    background: '#22c55e',
                    borderRadius: '2px',
                    transition: 'height 0.05s ease',
                  }}
                />
              );
            })}
          </div>
        )}
        <button
          onClick={() => setShowApiKeyInput(!showApiKeyInput)}
          style={{
            background: 'rgba(255,255,255,0.1)',
            border: '1px solid rgba(255,255,255,0.2)',
            borderRadius: '4px',
            padding: '4px 8px',
            color: 'white',
            fontSize: '11px',
            cursor: 'pointer',
            fontFamily: 'monospace',
            marginLeft: 'auto',
          }}
          title="OpenAI API Key"
        >
          ⚙
        </button>
      </div>

      {showApiKeyInput && (
        <div>
          <input
            type="password"
            value={apiKey}
            onChange={handleApiKeyChange}
            placeholder="OpenAI API Key (sk-...)"
            style={{
              width: '100%',
              background: 'rgba(255,255,255,0.1)',
              border: '1px solid rgba(255,255,255,0.2)',
              borderRadius: '4px',
              padding: '6px 8px',
              color: 'white',
              fontSize: '12px',
              fontFamily: 'monospace',
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />
          <div style={{ fontSize: '10px', opacity: 0.6, marginTop: '4px', fontFamily: 'monospace' }}>
            Stores in browser localStorage. Never exposed server-side.
          </div>
        </div>
      )}

      {state === 'unsupported' && (
        <div style={{ color: '#f87171', fontSize: '12px' }}>
          MediaRecorder not supported in this browser
        </div>
      )}

      <div
        style={{
          maxHeight: '120px',
          overflowY: 'auto',
          fontSize: '12px',
          lineHeight: '1.4',
        }}
      >
        {transcripts.length === 0 && (
          <div style={{ opacity: 0.5 }}>No transcripts yet</div>
        )}
        {transcripts.map((t, i) => (
          <div key={i}>
            {t.final && <div style={{ color: '#f3f4f6' }}>{t.final}</div>}
          </div>
        ))}
        <div ref={transcriptEndRef} />
      </div>

      {rejection && (
        <div
          style={{
            background: 'rgba(239,68,68,0.2)',
            border: '1px solid #ef4444',
            borderRadius: '4px',
            padding: '6px 8px',
            fontSize: '11px',
            color: '#fca5a5',
          }}
        >
          <div>
            <strong>Rejected:</strong> {rejection.reason}
          </div>
          <div style={{ opacity: 0.7 }}>"{rejection.raw}"</div>
        </div>
      )}
    </div>
  );
};

export default VoicePanelInner;
