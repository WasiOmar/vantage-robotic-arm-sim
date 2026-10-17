export const config = { runtime: 'edge' };

const rateLimitMap = new Map<string, number[]>();

export default async function handler(request: Request) {
  const origin = request.headers.get('origin');
  const url = new URL(request.url);
  const hostname = url.hostname;

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

  // CORS check: allow same-origin only in prod; localhost in dev; reject others with 403
  if (origin) {
    const originUrl = new URL(origin);
    const originHost = originUrl.hostname;
    const isLocalhost = originHost === 'localhost' || originHost === '127.0.0.1';
    const isDev = hostname === 'localhost' || hostname === '127.0.0.1';

    if (isDev) {
      if (!isLocalhost && originUrl.origin !== url.origin) {
        return new Response(JSON.stringify({ error: 'Forbidden' }), {
          status: 403,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    } else {
      if (originUrl.origin !== url.origin) {
        return new Response(JSON.stringify({ error: 'Forbidden' }), {
          status: 403,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    }
  }

  // Rate limiting: reject if > 30 req/min from same IP
  const ip = request.headers.get('x-forwarded-for') || 'unknown';
  const now = Date.now();
  let timestamps = rateLimitMap.get(ip) || [];
  timestamps = timestamps.filter((t) => now - t < 60000);
  
  if (timestamps.length >= 30) {
    return new Response(JSON.stringify({ error: 'Rate limit exceeded' }), {
      status: 429,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': origin || '*',
      },
    });
  }
  
  timestamps.push(now);
  rateLimitMap.set(ip, timestamps);

  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': origin || '*',
      },
    });
  }

  // Read API Key (Accept either OpenAI key or Anthropic key)
  const apiKey = process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY;
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
    const body = await request.json();
    // Cheap health check used by the UI: proves the proxy is up and a key is configured
    // without spending a model call.
    if (body?.probe) {
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': origin || '*' },
      });
    }
    const tools = body.tools || [];
    const messages = body.messages || [];
    const system = body.system;

    // Detect if the provided key is an OpenAI key (starts with sk-proj- or sk- and is not an Anthropic key)
    const isOpenAIKey = apiKey.startsWith('sk-proj-') || (apiKey.startsWith('sk-') && !apiKey.startsWith('sk-ant-'));

    if (isOpenAIKey) {
      // --- OpenAI Adapter Mode ---
      const openAiTools = tools.length > 0 ? tools.map((t: any) => ({
        type: 'function',
        function: {
          name: t.name,
          description: t.description,
          parameters: t.input_schema
        }
      })) : undefined;

      // Translate Anthropic-shaped history. One Anthropic message can hold several
      // tool_use / tool_result blocks, which map to several OpenAI messages.
      const openAiMessages: any[] = [];
      for (const m of messages) {
        if (!Array.isArray(m.content)) {
          openAiMessages.push({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content });
          continue;
        }
        const textParts = m.content.filter((c: any) => c.type === 'text' && c.text).map((c: any) => c.text);
        if (m.role === 'assistant') {
          const toolUses = m.content.filter((c: any) => c.type === 'tool_use');
          openAiMessages.push({
            role: 'assistant',
            content: textParts.join('\n') || null,
            ...(toolUses.length > 0
              ? {
                  tool_calls: toolUses.map((t: any) => ({
                    id: t.id,
                    type: 'function',
                    function: { name: t.name, arguments: JSON.stringify(t.input ?? {}) },
                  })),
                }
              : {}),
          });
        } else {
          for (const r of m.content.filter((c: any) => c.type === 'tool_result')) {
            openAiMessages.push({
              role: 'tool',
              tool_call_id: r.tool_use_id,
              content: typeof r.content === 'string' ? r.content : JSON.stringify(r.content),
            });
          }
          if (textParts.length > 0) openAiMessages.push({ role: 'user', content: textParts.join('\n') });
        }
      }

      if (system) {
        openAiMessages.unshift({
          role: 'system',
          content: system
        });
      }

      const payload: any = {
        model: 'gpt-4o-mini',
        messages: openAiMessages,
        max_tokens: 1024,
      };
      if (openAiTools) {
        payload.tools = openAiTools;
        payload.parallel_tool_calls = true;
      }

      const upstreamResponse = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      const openAiData = await upstreamResponse.json();
      if (!upstreamResponse.ok) {
        return new Response(JSON.stringify({ error: openAiData.error?.message || 'OpenAI API Error' }), {
          status: upstreamResponse.status,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': origin || '*'
          }
        });
      }

      const choice = openAiData.choices?.[0];
      const openAiMsg = choice?.message;

      const content: any[] = [];
      if (openAiMsg?.content) {
        content.push({
          type: 'text',
          text: openAiMsg.content
        });
      }
      // Map ALL tool_calls — not just [0] — so sequences like "press key 3 then key 5"
      // produce multiple tool_use blocks that agent.ts can execute sequentially.
      if (openAiMsg?.tool_calls?.length > 0) {
        for (const tc of openAiMsg.tool_calls) {
          content.push({
            type: 'tool_use',
            id: tc.id,
            name: tc.function.name,
            input: (() => {
              try {
                return JSON.parse(tc.function.arguments || '{}');
              } catch {
                return {};
              }
            })()
          });
        }
      }

      return new Response(JSON.stringify({ content }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': origin || '*'
        }
      });

    } else {
      // --- Standard Anthropic Mode ---
      const model = body.model ?? 'claude-opus-5-5';

      const upstreamResponse = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          // Server-side fallback: a safety-classifier refusal is retried on the
          // recommended fallback model instead of failing the turn.
          'anthropic-beta': 'server-side-fallback-2026-07-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model,
          max_tokens: 4096,
          // Arm control is latency-sensitive and the tool calls are simple.
          output_config: { effort: 'low' },
          fallbacks: 'default',
          ...(tools.length > 0 ? { tools } : {}),
          messages,
          ...(system ? { system } : {}),
        }),
      });

      const data = await upstreamResponse.json();
      return new Response(JSON.stringify(data), {
        status: upstreamResponse.status,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': origin || '*',
        },
      });
    }
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
