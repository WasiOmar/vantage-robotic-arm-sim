import { create } from 'zustand';

export type StepStatus = 'running' | 'done' | 'rejected' | 'skipped';

export interface AgentMessage {
  id: string;
  sender: 'user' | 'agent' | 'system';
  text: string;
  type?: 'text' | 'tool_call' | 'clarify' | 'rejection' | 'confirmation' | 'info';
  toolCallName?: string;
  toolCallArgs?: any;
  /** For tool_call messages: live execution status. */
  status?: StepStatus;
  /** Extra line (e.g. human-readable rejection reason). */
  detail?: string;
}

export type LlmStatus = 'checking' | 'online' | 'offline' | 'no-key';

interface AgentState {
  messages: AgentMessage[];
  isThinking: boolean;
  isExecuting: boolean;
  error: string | null;
  speakResult: boolean;
  waitingForClarification: boolean;
  llmStatus: LlmStatus;
  addMessage: (msg: Omit<AgentMessage, 'id'>) => string;
  updateMessage: (id: string, patch: Partial<AgentMessage>) => void;
  setThinking: (thinking: boolean) => void;
  setExecuting: (executing: boolean) => void;
  setError: (err: string | null) => void;
  setSpeakResult: (speak: boolean) => void;
  setWaitingForClarification: (waiting: boolean) => void;
  setLlmStatus: (status: LlmStatus) => void;
  clearMessages: () => void;
}

function readSpeakPref(): boolean {
  try {
    return localStorage.getItem('agent_speak') !== '0';
  } catch {
    return true;
  }
}

export const useAgentStore = create<AgentState>((set) => ({
  messages: [],
  isThinking: false,
  isExecuting: false,
  error: null,
  speakResult: readSpeakPref(),
  waitingForClarification: false,
  llmStatus: 'checking',
  addMessage: (msg) => {
    const id = crypto.randomUUID();
    set((state) => ({ messages: [...state.messages, { ...msg, id }].slice(-200) }));
    return id;
  },
  updateMessage: (id, patch) =>
    set((state) => ({ messages: state.messages.map((m) => (m.id === id ? { ...m, ...patch } : m)) })),
  setThinking: (isThinking) => set({ isThinking }),
  setExecuting: (isExecuting) => set({ isExecuting }),
  setError: (error) => set({ error }),
  setSpeakResult: (speakResult) => {
    try {
      localStorage.setItem('agent_speak', speakResult ? '1' : '0');
    } catch {
      // ignore
    }
    set({ speakResult });
  },
  setWaitingForClarification: (waitingForClarification) => set({ waitingForClarification }),
  setLlmStatus: (llmStatus) => set({ llmStatus }),
  clearMessages: () => set({ messages: [], error: null }),
}));
