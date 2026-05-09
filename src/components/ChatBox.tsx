'use client';

import { useEffect, useRef, useState } from 'react';

type ToolCall = { name: string; summary: string };

type Message = {
  role: 'user' | 'assistant';
  content: string;
  toolCalls?: ToolCall[];
};

type ChatResponse = {
  reply: string;
  toolCalls: ToolCall[];
  sessionId: string;
};

type HistoryResponse = { messages: Message[] };

const SESSION_KEY = 'chat-session-id';

export default function ChatBox() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(SESSION_KEY);
    } catch {
      // ignore
    }
    if (!saved) return;
    setSessionId(saved);

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/chat/history?sessionId=${encodeURIComponent(saved)}`,
        );
        if (!res.ok) return;
        const data = (await res.json()) as HistoryResponse;
        if (!cancelled && Array.isArray(data.messages)) {
          setMessages(data.messages);
        }
      } catch {
        // ignore — fresh session if history fetch fails
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: 'smooth',
    });
  }, [messages, loading]);

  function clear() {
    setMessages([]);
    setSessionId(null);
    try {
      localStorage.removeItem(SESSION_KEY);
    } catch {
      // ignore
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || loading) return;

    const newUserMsg: Message = { role: 'user', content: trimmed };
    setMessages((prev) => [...prev, newUserMsg]);
    setInput('');
    setLoading(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: trimmed,
          sessionId: sessionId ?? undefined,
        }),
      });

      const data = (await res.json().catch(() => null)) as ChatResponse | null;

      if (!res.ok || !data) {
        const errText = data?.reply || `Request failed (${res.status})`;
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: `⚠ ${errText}` },
        ]);
        return;
      }

      if (!sessionId && data.sessionId) {
        setSessionId(data.sessionId);
        try {
          localStorage.setItem(SESSION_KEY, data.sessionId);
        } catch {
          // ignore
        }
      }

      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: data.reply,
          toolCalls: data.toolCalls?.length ? data.toolCalls : undefined,
        },
      ]);
    } catch (err) {
      const errText = err instanceof Error ? err.message : 'Network error';
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: `⚠ ${errText}` },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-full max-w-[600px] mx-auto flex flex-col gap-4 p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-medium text-neutral-900">Chat with us</h2>
        <button
          type="button"
          onClick={clear}
          disabled={loading || messages.length === 0}
          className="text-xs text-neutral-500 hover:text-neutral-900 disabled:opacity-40 disabled:hover:text-neutral-500"
        >
          Clear
        </button>
      </div>

      <div
        ref={scrollRef}
        className="flex flex-col gap-3 max-h-[500px] overflow-y-auto p-3 rounded-md bg-white/40 border border-neutral-200"
      >
        {messages.length === 0 && !loading && (
          <p className="text-sm text-neutral-400 italic">
            Ask about a piece, the atelier, or an order.
          </p>
        )}

        {messages.map((m, i) => (
          <div
            key={i}
            className={`flex flex-col max-w-[80%] ${
              m.role === 'user' ? 'self-end items-end' : 'self-start items-start'
            }`}
          >
            {m.role === 'assistant' &&
              m.toolCalls?.map((t, j) => (
                <p
                  key={j}
                  className="text-xs italic text-neutral-400 mb-1"
                  title={t.name}
                >
                  ✓ {t.summary}
                </p>
              ))}
            <div
              className={`px-4 py-2 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
                m.role === 'user'
                  ? 'bg-neutral-900 text-white'
                  : 'bg-neutral-100 text-neutral-900'
              }`}
            >
              {m.content}
            </div>
          </div>
        ))}

        {loading && (
          <div className="self-start max-w-[80%] px-4 py-2 rounded-2xl bg-neutral-100 text-neutral-500 italic text-sm">
            thinking…
          </div>
        )}
      </div>

      <form onSubmit={submit} className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type a message…"
          disabled={loading}
          className="flex-1 px-4 py-2 rounded-md bg-white border border-neutral-200 text-sm text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:border-neutral-400 disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="px-4 py-2 rounded-md bg-neutral-900 text-white text-sm font-medium hover:bg-neutral-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          Send
        </button>
      </form>
    </div>
  );
}
