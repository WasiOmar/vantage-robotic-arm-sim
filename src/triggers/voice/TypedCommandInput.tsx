import { useState, useCallback, useEffect } from 'react';

import { parseUtterance, isParseError } from './grammar';
import { commandBus } from '../../bus/commandBus';
import { voiceTrigger, type VoiceState } from './voiceTrigger';

interface HistoryEntry {
  verdict: 'accepted' | 'rejected';
  type?: string;
  reason?: string;
  raw: string;
}

const TypedCommandInput = () => {
  const [text, setText] = useState('');
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [micState, setMicState] = useState<VoiceState>('idle');

  useEffect(() => {
    const unsubState = voiceTrigger.onState(setMicState);
    const unsubTranscript = voiceTrigger.onTranscript((partial, final) => {
      if (final) {
        setText(final);
      } else if (partial) {
        setText(partial);
      }
    });
    return () => {
      unsubState();
      unsubTranscript();
      voiceTrigger.stopVoice();
    };
  }, []);

  const toggleMic = () => {
    if (micState === 'listening') {
      voiceTrigger.stopVoice();
    } else {
      voiceTrigger.startVoice();
    }
  };

  const handleSubmit = useCallback(async () => {
    const trimmed = text.trim();
    if (!trimmed) return;

    const result = parseUtterance(trimmed);

    if (isParseError(result)) {
      setHistory((prev) => [
        { verdict: 'rejected' as const, reason: result.reason, raw: result.raw },
        ...prev,
      ].slice(0, 3));
      setText('');
      return;
    }

    const typedCmd = { ...result, source: 'typed' as const };
    const verdict = await commandBus.dispatch(typedCmd);

    setHistory((prev) => [
      { verdict: verdict as 'accepted' | 'rejected', type: result.type, raw: trimmed },
      ...prev,

    ].slice(0, 3));
    setText('');
  }, [text]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit]
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem', padding: '0.5rem 0', width: '100%' }}>
      {/* Big Circular Voice Toggle */}
      <button 
        onClick={toggleMic}
        style={{
          width: '120px', height: '120px', borderRadius: '50%',
          background: micState === 'listening' ? 'rgba(255,51,51,0.1)' : 'rgba(255,140,0,0.05)',
          border: `2px solid ${micState === 'listening' ? '#cc0000' : '#ff8c00'}`,
          color: micState === 'listening' ? '#cc0000' : '#ff8c00',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
          boxShadow: micState === 'listening' ? '0 0 30px rgba(255,51,51,0.2)' : 'none',
          transition: 'all 0.3s',
          cursor: 'pointer'
        }}
      >
        <span style={{ fontWeight: 'bold' }}>{micState === 'listening' ? 'LISTENING' : 'TAP TO SPEAK'}</span>
        <div style={{ display: 'flex', gap: '4px', alignItems: 'flex-end', height: '24px', justifyContent: 'center', marginTop: '0.5rem' }}>
          {[
            { h: '60%', d: '0s' },
            { h: '100%', d: '0.1s' },
            { h: '70%', d: '0.2s' },
            { h: '90%', d: '0.3s' },
            { h: '50%', d: '0.4s' }
          ].map((bar, i) => (
            <div 
              key={i} 
              style={{ 
                width: '4px', 
                background: micState === 'listening' ? '#cc0000' : '#ccc', 
                height: micState === 'listening' ? bar.h : '20%',
                borderRadius: '2px',
                animation: micState === 'listening' ? `sound-bounce-${i} 0.5s ease-in-out infinite alternate ${bar.d}` : 'none',
                transition: 'background 0.3s'
              }} 
            />
          ))}
        </div>
      </button>

      {/* Input Box */}
      <div style={{ width: '85%', background: 'rgba(255,255,255,0.08)', padding: '0.75rem 1rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.15)', textAlign: 'center', boxSizing: 'border-box' }}>
        <div style={{ fontSize: '0.65rem', color: '#9ca3af', marginBottom: '0.4rem', textTransform: 'uppercase', fontWeight: 'bold' }}>
          Agentic Command
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <input
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a command (e.g., jog joint 1 by 10 degrees)..."
            style={{
              flex: 1,
              background: 'rgba(255,255,255,0.1)',
              border: '1px solid rgba(255,255,255,0.2)',
              borderRadius: '4px',
              padding: '8px',
              color: '#fff',
              fontSize: '0.85rem',
              outline: 'none',
              width: '100%',
              boxSizing: 'border-box'
            }}
          />
          <button
            onClick={handleSubmit}
            style={{
              background: '#ff8c00',
              border: 'none',
              borderRadius: '4px',
              padding: '8px 12px',
              color: 'white',
              fontSize: '0.85rem',
              cursor: 'pointer',
              fontWeight: 'bold'
            }}
          >
            Send
          </button>
        </div>

        {history.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '0.5rem' }}>
            {history.map((entry, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontSize: '0.75rem',
                  padding: '6px 8px',
                  background: entry.verdict === 'accepted' ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
                  borderRadius: '4px',
                  border: `1px solid ${entry.verdict === 'accepted' ? '#22c55e' : '#ef4444'}`,
                  textAlign: 'left'
                }}
              >
                <span
                  style={{
                    color: entry.verdict === 'accepted' ? '#16a34a' : '#dc2626',
                    fontWeight: 'bold',
                    minWidth: '60px',
                  }}
                >
                  {entry.verdict.toUpperCase()}
                </span>
                <span style={{ color: '#ccc', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {entry.raw}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default TypedCommandInput;
