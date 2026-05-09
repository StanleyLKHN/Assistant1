import Anthropic from '@anthropic-ai/sdk';
import { MODEL, SYSTEM_PROMPT } from '@/src/lib/prompt';
import { TOOL_DEFINITIONS, runTool } from '@/src/lib/tools';
import { getSupabase } from '@/src/lib/supabase';

type IncomingBody = {
  message?: string;
  sessionId?: string;
};

type ToolCallSummary = {
  name: string;
  summary: string;
};

type ChatResponse = {
  reply: string;
  toolCalls: ToolCallSummary[];
  sessionId: string;
};

const MAX_ITERATIONS = 4;
const MAX_TOKENS = 600;

export async function POST(request: Request): Promise<Response> {
  let body: IncomingBody;
  try {
    body = (await request.json()) as IncomingBody;
  } catch {
    return errorResponse('invalid JSON body', 400, '');
  }

  const message = body.message?.trim();
  if (!message) {
    return errorResponse('missing message', 400, body.sessionId ?? '');
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return errorResponse('ANTHROPIC_API_KEY is not set', 500, body.sessionId ?? '');
  }

  let supabase;
  try {
    supabase = getSupabase();
  } catch (err) {
    return errorResponse(asMessage(err), 500, body.sessionId ?? '');
  }

  let sessionId = body.sessionId;
  if (sessionId) {
    const { data: existing } = await supabase
      .from('unweave_chat_sessions')
      .select('id')
      .eq('id', sessionId)
      .maybeSingle();
    if (!existing) sessionId = undefined;
  }
  if (!sessionId) {
    const { data, error } = await supabase
      .from('unweave_chat_sessions')
      .insert({})
      .select('id')
      .single();
    if (error || !data) {
      return errorResponse(
        `failed to create session: ${error?.message ?? 'no data'}`,
        500,
        '',
      );
    }
    sessionId = data.id as string;
  }

  const { data: rows, error: historyError } = await supabase
    .from('unweave_chat_messages')
    .select('role, content')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true });

  if (historyError) {
    return errorResponse(`failed to load history: ${historyError.message}`, 500, sessionId);
  }

  const messages: Anthropic.MessageParam[] = (rows ?? []).map((row) => ({
    role: row.role as 'user' | 'assistant',
    content: row.content as string,
  }));

  const { error: insertUserErr } = await supabase
    .from('unweave_chat_messages')
    .insert({ session_id: sessionId, role: 'user', content: message });
  if (insertUserErr) {
    return errorResponse(
      `failed to save user message: ${insertUserErr.message}`,
      500,
      sessionId,
    );
  }

  messages.push({ role: 'user', content: message });

  const anthropic = new Anthropic({ apiKey });
  const toolCalls: ToolCallSummary[] = [];
  let reply = '';
  let resolved = false;

  try {
    for (let i = 0; i < MAX_ITERATIONS; i++) {
      const response = await anthropic.messages.create({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: SYSTEM_PROMPT,
        tools: TOOL_DEFINITIONS,
        messages,
      });

      if (response.stop_reason !== 'tool_use') {
        reply = response.content
          .filter((b): b is Anthropic.TextBlock => b.type === 'text')
          .map((b) => b.text)
          .join('')
          .trim();
        resolved = true;
        break;
      }

      messages.push({ role: 'assistant', content: response.content });

      const toolUses = response.content.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use',
      );

      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const block of toolUses) {
        const { result, summary } = await runTool(
          block.name,
          (block.input ?? {}) as Record<string, unknown>,
        );
        toolCalls.push({ name: block.name, summary });
        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: result,
        });
      }

      messages.push({ role: 'user', content: toolResults });
    }

    if (!resolved) {
      reply = 'Sorry, I lost track. Please try again.';
    }
  } catch (err) {
    return errorResponse(asMessage(err), 500, sessionId, toolCalls);
  }

  const { error: insertAsstErr } = await supabase.from('unweave_chat_messages').insert({
    session_id: sessionId,
    role: 'assistant',
    content: reply,
    tool_calls: toolCalls.length > 0 ? toolCalls : null,
  });
  if (insertAsstErr) {
    console.error('Failed to save assistant message:', insertAsstErr.message);
  }

  return Response.json({ reply, toolCalls, sessionId } satisfies ChatResponse);
}

function errorResponse(
  detail: string,
  status: number,
  sessionId: string,
  toolCalls: ToolCallSummary[] = [],
): Response {
  return Response.json(
    { reply: `Error: ${detail}`, toolCalls, sessionId } satisfies ChatResponse,
    { status },
  );
}

function asMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
