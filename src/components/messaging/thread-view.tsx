'use client';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/field';
import { Avatar } from '@/components/ui/avatar';
import { useToast } from '@/components/ui/toast';
import { api, ApiRequestError } from '@/lib/client';
import { cn, formatDate } from '@/lib/utils';

export type ThreadMessage = {
  id: string;
  body: string;
  createdAt: Date | string;
  senderUserId: string;
  sender: { id: string; name: string };
};

export function ThreadView({
  threadId,
  subject,
  messages,
  currentUserId,
  closed,
}: {
  threadId: string;
  subject: string;
  messages: ThreadMessage[];
  currentUserId: string;
  closed?: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [body, setBody] = useState('');
  const [loading, setLoading] = useState(false);
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    setLoading(true);
    try {
      await api.patch('/api/messages', { threadId, body });
      setBody('');
      router.refresh();
    } catch (err) {
      toast.error(err instanceof ApiRequestError ? err.message : 'Your message could not be sent.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex h-[70vh] flex-col rounded-xl border border-slate-200 bg-white shadow-card">
      <header className="border-b border-slate-200 px-5 py-3">
        <h2 className="text-sm font-semibold text-slate-900">{subject}</h2>
      </header>

      <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
        {messages.map((m) => {
          const mine = m.senderUserId === currentUserId;
          return (
            <div key={m.id} className={cn('flex gap-3', mine && 'flex-row-reverse')}>
              <Avatar name={m.sender.name} size="sm" />
              <div className={cn('max-w-[75%]', mine && 'text-right')}>
                <p className="text-xs text-slate-500">
                  {mine ? 'You' : m.sender.name} · {formatDate(m.createdAt, { dateStyle: 'medium', timeStyle: 'short' })}
                </p>
                <div
                  className={cn(
                    'mt-1 inline-block whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-sm',
                    mine ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-800',
                  )}
                >
                  {m.body}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>

      {closed ? (
        <p className="border-t border-slate-200 px-5 py-4 text-sm text-slate-500">This conversation has been closed.</p>
      ) : (
        <form onSubmit={send} className="flex items-end gap-2 border-t border-slate-200 p-3">
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={2}
            placeholder="Write a message…"
            className="flex-1"
          />
          <Button type="submit" loading={loading} disabled={!body.trim()}>
            <Send className="h-4 w-4" />
          </Button>
        </form>
      )}
    </div>
  );
}
