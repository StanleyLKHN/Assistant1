import { getSupabase } from '@/src/lib/supabase';

type ToolCall = { name: string; summary: string };

type HistoryMessage = {
  role: 'user' | 'assistant';
  content: string;
  toolCalls?: ToolCall[];
};

export async function GET(request: Request): Promise<Response> {
  const sessionId = new URL(request.url).searchParams.get('sessionId');
  if (!sessionId) {
    return Response.json({ error: 'missing sessionId' }, { status: 400 });
  }

  let supabase;
  try {
    supabase = getSupabase();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message }, { status: 500 });
  }

  const { data, error } = await supabase
    .from('unweave_chat_messages')
    .select('role, content, tool_calls')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true });

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  const messages: HistoryMessage[] = (data ?? []).map((row) => {
    const toolCalls = row.tool_calls as ToolCall[] | null;
    return {
      role: row.role as 'user' | 'assistant',
      content: row.content as string,
      toolCalls: toolCalls && toolCalls.length > 0 ? toolCalls : undefined,
    };
  });

  return Response.json({ messages });
}
