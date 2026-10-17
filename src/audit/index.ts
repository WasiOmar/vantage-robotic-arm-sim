import type { ArmCommand } from '../types/commands';

export interface AuditEntry {
  id: string;
  timestamp: number;
  command: ArmCommand;
  verdict: 'ACCEPTED' | 'REJECTED';
  reason?: string;
  ikError?: number;
  finalVsRequestedPositionError?: number; // Distance between achieved tip pos and requested pos
}

class AuditLog {
  private log: AuditEntry[] = [];

  public append(entry: AuditEntry): void {
    this.log.push(entry);
    // In a real app, this might persist to a server or local storage.
  }

  public getLog(): AuditEntry[] {
    return [...this.log];
  }

  // Stub for generating an end-of-session summary report
  public generateSessionSummary(): string {
    const totalCommands = this.log.length;
    const accepted = this.log.filter(e => e.verdict === 'ACCEPTED').length;
    const rejected = totalCommands - accepted;
    
    return `Session Summary:
Total Commands: ${totalCommands}
Accepted: ${accepted}
Rejected: ${rejected}
    `;
  }
}

export const auditLog = new AuditLog();
