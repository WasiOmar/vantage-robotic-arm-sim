export const config = { runtime: 'edge' };

export default async function handler(request: Request) {
  const origin = request.headers.get('origin');

  // CORS Preflight check
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': origin || '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  // Whisper is an OpenAI endpoint, so only an OpenAI key works here.
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'server-key-missing' }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': origin || '*',
      },
    });
  }

  try {
    const requestFormData = await request.formData();
    const file = requestFormData.get('file');
    if (!file) {
      return new Response(JSON.stringify({ error: 'Missing audio file' }), {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': origin || '*',
        },
      });
    }

    const formData = new FormData();
    // Preserve the client's filename: Whisper sniffs the container from the extension
    // (Safari records audio/mp4, not webm).
    const fileName = (file as File).name || 'audio.webm';
    formData.append('file', file as Blob, fileName);
    formData.append('model', 'whisper-1');
    formData.append('language', 'en');
    const prompt = requestFormData.get('prompt');
    if (typeof prompt === 'string' && prompt) formData.append('prompt', prompt.slice(0, 800));
    formData.append('temperature', '0');

    const upstreamResponse = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
      body: formData,
    });

    const data = await upstreamResponse.json();
    return new Response(JSON.stringify(data), {
      status: upstreamResponse.status,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': origin || '*',
      },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message || 'Internal Server Error' }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': origin || '*',
      },
    });
  }
}
