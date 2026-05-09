import Anthropic from '@anthropic-ai/sdk';
import { MODEL, SYSTEM_PROMPT } from '@/src/lib/prompt';
import { TOOL_DEFINITIONS, runTool } from '@/src/lib/tools';

type IncomingMessage = {
  role: 'user' | 'assistant';
  content: string;
};

type ToolCallSummary = {
  name: string;
  summary: string;
};

type ChatResponse = {
  reply: string;
  toolCalls: ToolCallSummary[];
};

const MAX_ITERATIONS = 4;
const MAX_TOKENS = 600;

export async function POST(request: Request): Promise<Response> {
  let body: { messages?: IncomingMessage[] };
  try {
    body = (await request.json()) as { messages?: IncomingMessage[] };
  } catch {
    return Response.json(
      { reply: 'Error: invalid JSON body', toolCalls: [] } satisfies ChatResponse,
      { status: 400 },
    );
  }

  if (!body.messages || !Array.isArray(body.messages)) {
    return Response.json(
      { reply: 'Error: missing messages array', toolCalls: [] } satisfies ChatResponse,
      { status: 400 },
    );
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return Response.json(
      { reply: 'Error: ANTHROPIC_API_KEY is not set', toolCalls: [] } satisfies ChatResponse,
      { status: 500 },
    );
  }

  const anthropic = new Anthropic({ apiKey });

  const messages: Anthropic.MessageParam[] = body.messages.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  const toolCalls: ToolCallSummary[] = [];

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
        const reply = response.content
          .filter((block): block is Anthropic.TextBlock => block.type === 'text')
          .map((block) => block.text)
          .join('')
          .trim();
        return Response.json({ reply, toolCalls } satisfies ChatResponse);
      }

      messages.push({ role: 'assistant', content: response.content });

      const toolUseBlocks = response.content.filter(
        (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use',
      );

      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const block of toolUseBlocks) {
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

    return Response.json({
      reply: 'Sorry, I lost track. Please try again.',
      toolCalls,
    } satisfies ChatResponse);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json(
      { reply: `Error: ${message}`, toolCalls } satisfies ChatResponse,
      { status: 500 },
    );
  }
}
