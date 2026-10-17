import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useStore } from '../store';
import { auditLog } from '../audit';
import type { AuditEntry } from '../audit';
import { generateHTMLReport, generateCSVReport } from '../audit/generate_report';

export const AuditLog: React.FC = () => {
  const controlMode = useStore(state => state.controlMode);
  
  const [logs, setLogs] = useState<AuditEntry[]>([]);
  const [isPaused, setIsPaused] = useState(true);
  const [reportText, setReportText] = useState<string | null>(null);
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const modeStartTime = useRef<number>(Date.now());

  // Reset when control mode changes
  useEffect(() => {
    setIsPaused(true);
    setLogs([]);
    modeStartTime.current = Date.now();
  }, [controlMode]);

  // Poll for new logs if not paused
  useEffect(() => {
    const interval = setInterval(() => {
      if (!isPaused) {
        const modeLogs = auditLog.getLog().filter(l => l.timestamp >= modeStartTime.current);
        setLogs(modeLogs.slice(-4));
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [isPaused, controlMode]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  const handleGenerateReport = () => {
    const modeLogs = auditLog.getLog().filter(l => l.timestamp >= modeStartTime.current);
    const htmlReport = generateHTMLReport(modeLogs, controlMode, modeStartTime.current);
    setReportText(htmlReport);
  };

  const downloadReport = (format: 'html' | 'csv') => {
    const modeLogs = auditLog.getLog().filter(l => l.timestamp >= modeStartTime.current);
    const content = format === 'html' ? reportText : generateCSVReport(modeLogs, controlMode);
    
    if (!content) return;
    
    const mimeType = format === 'html' ? 'text/html' : 'text/csv';
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `vantage_report_${controlMode.toLowerCase()}_${Date.now()}.${format}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="glass-panel" style={{ width: '100%', display: 'flex', flexDirection: 'column', padding: '1rem', zIndex: 10, boxSizing: 'border-box' }}>
      
      {/* Report Modal */}
      {reportText && createPortal(
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div style={{ background: '#f8fafc', padding: '0', borderRadius: '12px', width: '95%', maxWidth: '900px', height: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 10px 40px rgba(0,0,0,0.5)', overflow: 'hidden' }}>
            <div style={{ padding: '1rem 1.5rem', background: '#fff', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, color: '#0f172a' }}>Executive Report Preview</h3>
              <button onClick={() => setReportText(null)} style={{ background: 'transparent', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: '#64748b' }}>&times;</button>
            </div>
            
            <iframe 
              srcDoc={reportText} 
              style={{ flex: 1, width: '100%', border: 'none', background: '#fff' }}
              title="Report Preview"
            />
            
            <div style={{ padding: '1rem 1.5rem', background: '#fff', borderTop: '1px solid #e2e8f0', display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
              <button onClick={() => setReportText(null)} style={{ padding: '0.6rem 1.2rem', background: '#222', color: '#ff8c00', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>Close</button>
              <button onClick={() => downloadReport('csv')} style={{ padding: '0.6rem 1.2rem', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>Download .csv</button>
              <button onClick={() => downloadReport('html')} style={{ padding: '0.6rem 1.2rem', background: '#10b981', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>Download .html</button>
            </div>
          </div>
        </div>,
        document.body
      )}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
        <h2 style={{ margin: 0, fontSize: '1.2rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#fff' }}>
          Session Log
        </h2>
        <button 
          onClick={() => setIsPaused(!isPaused)} 
          style={{ 
            width: '28px', height: '28px', borderRadius: '50%', border: 'none', 
            background: isPaused ? '#ff6600' : '#f59e0b', color: '#fff', 
            display: 'flex', alignItems: 'center', justifyContent: 'center', 
            cursor: 'pointer', fontSize: '0.8rem', fontWeight: 'bold' 
          }}
        >
          {isPaused ? '▶' : '⏸'}
        </button>
      </div>
      
      <div 
        ref={scrollRef}
        style={{ 
          flex: 1, 
          overflowY: 'auto', 
          background: '#111', 
          border: '1px solid #333',
          borderRadius: '4px', 
          padding: '0.5rem',
          fontFamily: '"JetBrains Mono", monospace',
          fontSize: '0.75rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          minHeight: '120px'
        }}
      >
        {isPaused && logs.length === 0 && (
          <div style={{ color: '#aaa', textAlign: 'center', marginTop: '1rem' }}>Paused. Click ▶ to record.</div>
        )}
        {!isPaused && logs.length === 0 && (
          <div style={{ color: '#aaa', textAlign: 'center', marginTop: '1rem' }}>Recording... Waiting for commands.</div>
        )}
        {[...logs].map(log => {
          let color = '#eee';
          if (log.verdict === 'REJECTED') {
             color = '#cc0000';
          } else if (log.verdict === 'ACCEPTED') {
             color = '#008800';
          }

          const time = new Date(log.timestamp).toISOString().split('T')[1].slice(0, -1);

          return (
            <div key={log.id} style={{ display: 'flex', flexDirection: 'column', gap: '2px', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '4px' }}>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <span style={{ color: '#888', minWidth: '85px' }}>[{time}]</span>
                <span style={{ color: '#aaa', minWidth: '70px', fontWeight: 'bold' }}>[{log.command.source}]</span>
                <span style={{ color, display: 'flex', alignItems: 'center', gap: '4px' }}>
                  {log.command.type} - {log.verdict}
                  {log.reason && <span style={{ opacity: 0.7 }}>({log.reason})</span>}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <button 
        onClick={handleGenerateReport}
        className="btn-industrial"
        style={{ marginTop: '1rem', width: '100%' }}
      >
        Generate Report
      </button>
    </div>
  );
};

export default AuditLog;
