// Vocabulary hint: biases Whisper toward the command words we actually parse
// ("key four" instead of "key for", "joint" instead of "join").
const COMMAND_PROMPT =
  'Robot arm commands: press key 3, enter pin 1 2 3 4 5 6, jog joint 2 by 15 degrees, rotate joint 1 to 90 degrees, ' +
  'move up 5 centimeters, go home, emergency stop, reset, set speed to 40 rpm.';

function extensionFor(mime: string): string {
  if (mime.includes('mp4') || mime.includes('m4a') || mime.includes('aac')) return 'm4a';
  if (mime.includes('ogg')) return 'ogg';
  if (mime.includes('wav')) return 'wav';
  if (mime.includes('mpeg')) return 'mp3';
  return 'webm';
}

async function readError(response: Response): Promise<string> {
  const body = await response.text().catch(() => '');
  try {
    const data = JSON.parse(body);
    const e = data?.error;
    if (e === 'server-key-missing') return 'Server has no OPENAI_API_KEY for Whisper. Add one in settings (⚙) or the server env.';
    if (typeof e === 'string') return e;
    if (e?.message) return e.message;
  } catch {
    // not JSON (e.g. dev proxy HTML)
  }
  if (response.status === 401) return 'Whisper rejected the API key (401).';
  if (response.status === 404 || response.status === 502 || response.status === 504 || /ECONNREFUSED|proxy error/i.test(body)) {
    return 'Transcription server unreachable. Run `vercel dev` for /api, or set an OpenAI key in settings (⚙).';
  }
  return `Transcription failed (${response.status})`;
}

export async function transcribeWithWhisper(audioBlob: Blob, apiKey: string, opts?: { prompt?: string; signal?: AbortSignal }): Promise<string> {
  const formData = new FormData();
  formData.append('file', audioBlob, `audio.${extensionFor(audioBlob.type || '')}`);
  formData.append('model', 'whisper-1');
  formData.append('language', 'en');
  formData.append('prompt', opts?.prompt ?? COMMAND_PROMPT);
  formData.append('temperature', '0');

  const url = apiKey ? 'https://api.openai.com/v1/audio/transcriptions' : '/api/transcribe';
  const headers: Record<string, string> = {};
  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }

  let response: Response;
  try {
    response = await fetch(url, { method: 'POST', headers, body: formData, signal: opts?.signal });
  } catch (err) {
    if ((err as Error)?.name === 'AbortError') throw err;
    throw new Error('Network error reaching the transcription service.');
  }

  if (!response.ok) {
    throw new Error(await readError(response));
  }

  const data = await response.json();
  return typeof data?.text === 'string' ? data.text : '';
}
