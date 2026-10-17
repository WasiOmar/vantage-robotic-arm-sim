export interface LLMResponse {
  content: Array<{
    type: string; // 'text' | 'tool_use' | 'thinking' | ...
    text?: string;
    id?: string;
    name?: string;
    input?: any;
    [key: string]: unknown;
  }>;
  stop_reason?: string;
  stop_details?: { category?: string | null; explanation?: string | null } | null;
}

export type LLMErrorKind = 'no-key' | 'offline' | 'rate-limit' | 'timeout' | 'aborted' | 'api';

export class LLMError extends Error {
  kind: LLMErrorKind;
  constructor(kind: LLMErrorKind, message: string) {
    super(message);
    this.kind = kind;
    this.name = 'LLMError';
  }
}

/** True for failures where the LLM is unreachable (as opposed to a bad request). */
export function isConnectivityError(err: unknown): boolean {
  return err instanceof LLMError && (err.kind === 'no-key' || err.kind === 'offline' || err.kind === 'timeout');
}

const TIMEOUT_MS = 25000;

function extractMessage(data: any): string | null {
  const e = data?.error;
  if (typeof e === 'string') return e;
  if (e && typeof e.message === 'string') return e.message;
  if (typeof data?.message === 'string') return data.message;
  return null;
}

export async function callLLM(
  messages: any[],
  tools: any[],
  opts?: { model?: string; system?: string; signal?: AbortSignal }
): Promise<LLMResponse> {
  const executeCall = async (): Promise<LLMResponse> => {
    const controller = new AbortController();
    let timedOut = false;
    const timeoutId = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, TIMEOUT_MS);
    const onOuterAbort = () => controller.abort();
    opts?.signal?.addEventListener('abort', onOuterAbort);

    let response: Response;
    try {
      response = await fetch('/api/llm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages, tools, model: opts?.model, system: opts?.system }),
        signal: controller.signal,
      });
    } catch {
      if (opts?.signal?.aborted) throw new LLMError('aborted', 'Cancelled');
      if (timedOut) throw new LLMError('timeout', 'The language model took too long to answer.');
      throw new LLMError('offline', 'Cannot reach the LLM proxy (/api/llm). Is `vercel dev` running?');
    } finally {
      clearTimeout(timeoutId);
      opts?.signal?.removeEventListener('abort', onOuterAbort);
    }

    const body = await response.text().catch(() => '');
    let data: any = null;
    try {
      data = body ? JSON.parse(body) : null;
    } catch {
      // Non-JSON: usually the Vite dev proxy failing to reach the API server.
      throw new LLMError('offline', 'LLM proxy returned an invalid response. Is the /api server running (`vercel dev`)?');
    }

    if (data?.error === 'server-key-missing') {
      throw new LLMError('no-key', 'No ANTHROPIC_API_KEY on the server. Add it to the Vercel env / .env.');
    }
    if (!response.ok) {
      const msg = extractMessage(data) || `HTTP ${response.status}`;
      if (response.status === 429) throw new LLMError('rate-limit', `Rate limited: ${msg}`);
      if (response.status === 401 || response.status === 403) throw new LLMError('no-key', `API key rejected: ${msg}`);
      if (response.status >= 502 && response.status <= 504) throw new LLMError('offline', `LLM upstream unavailable (${response.status}).`);
      throw new LLMError('api', msg);
    }
    if (!data || !Array.isArray(data.content)) {
      throw new LLMError('api', extractMessage(data) || 'Malformed response from the language model.');
    }
    return data as LLMResponse;
  };

  try {
    return await executeCall();
  } catch (err) {
    // One retry for transient network blips only (not timeouts, cancels, or API errors).
    if (err instanceof LLMError && err.kind === 'offline' && !opts?.signal?.aborted) {
      await new Promise((r) => setTimeout(r, 400));
      return executeCall();
    }
    throw err;
  }
}

/** Checks that /api/llm is reachable and has a key, without a model call. */
export async function probeLLM(): Promise<'online' | 'offline' | 'no-key'> {
  try {
    const response = await fetch('/api/llm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ probe: true }),
    });
    const data = await response.json().catch(() => null);
    if (data?.error === 'server-key-missing') return 'no-key';
    if (response.ok && data?.ok) return 'online';
    return 'offline';
  } catch {
    return 'offline';
  }
}
