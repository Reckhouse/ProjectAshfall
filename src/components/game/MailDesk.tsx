"use client";

import { useState } from "react";
import type { MailDesk as MailDeskData } from "@/game/domain/types";

type ApiError = { ok: false; message?: string; code?: string };

function newActionId(): string {
  return crypto.randomUUID();
}

export function MailDesk({ initial }: { initial: MailDeskData }) {
  const [desk, setDesk] = useState(initial);
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState("Mail channel open.");
  const [toCallsign, setToCallsign] = useState("");
  const [body, setBody] = useState("");

  async function send(path: string, payload: unknown): Promise<MailDeskData | null> {
    setPending(true);
    try {
      const response = await fetch(path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await response.json()) as ApiError | { ok: true; mail: MailDeskData };
      if (!response.ok || !("mail" in data)) {
        setFeedback("message" in data ? data.message ?? "Mail command rejected." : "Mail command rejected.");
        return null;
      }
      setDesk(data.mail);
      return data.mail;
    } finally {
      setPending(false);
    }
  }

  async function sendDirect(event: React.FormEvent) {
    event.preventDefault();
    const next = await send("/api/game/mail", {
      actionId: newActionId(),
      payload: { toCallsign, body },
    });
    if (next) {
      setFeedback(`Message sent to ${toCallsign.trim()}.`);
      setToCallsign("");
      setBody("");
    }
  }

  async function sendAlliance(event: React.FormEvent) {
    event.preventDefault();
    const next = await send("/api/game/mail", {
      actionId: newActionId(),
      payload: { channel: "ALLIANCE", body },
    });
    if (next) {
      setFeedback("Circular posted to the alliance.");
      setBody("");
    }
  }

  async function markRead(messageId: string) {
    await send("/api/game/mail/read", {
      actionId: newActionId(),
      payload: { messageId },
    });
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-[var(--ash-muted)]" data-testid="mail-feedback">
        {feedback}
      </p>
      <p className="font-mono text-xs uppercase tracking-[0.12em] text-[var(--ash-muted)]" data-testid="mail-unread-count">
        {desk.unreadCount} unread
      </p>

      <section className="ash-frame p-4">
        <p className="ash-label">Compose</p>
        <p className="mt-2 max-w-xl text-sm text-[var(--ash-muted)]">
          Mail is stored on the server. Addresses are callsigns. Do not send coordinates or stockpile numbers you
          want to keep private.
        </p>
        <form className="mt-4 space-y-3" onSubmit={(event) => void sendDirect(event)}>
          <input
            value={toCallsign}
            onChange={(event) => setToCallsign(event.target.value)}
            minLength={3}
            maxLength={16}
            placeholder="Callsign"
            data-testid="mail-to-input"
            className="min-h-11 w-full max-w-xs border border-[var(--ash-border)] bg-black/30 px-3 text-[var(--ash-text)]"
          />
          <textarea
            value={body}
            onChange={(event) => setBody(event.target.value)}
            minLength={1}
            maxLength={280}
            required
            rows={4}
            placeholder="Message"
            data-testid="mail-body-input"
            className="min-h-24 w-full border border-[var(--ash-border)] bg-black/30 px-3 py-2 text-[var(--ash-text)]"
          />
          <div className="flex flex-wrap gap-3">
            <button
              type="submit"
              disabled={pending || !toCallsign.trim()}
              data-testid="mail-send"
              className="min-h-11 border border-[var(--ash-rust)] px-4 text-sm uppercase tracking-[0.14em] disabled:opacity-60"
            >
              Send mail
            </button>
            {desk.canPostAlliance ? (
              <button
                type="button"
                disabled={pending || !body.trim()}
                data-testid="mail-alliance"
                onClick={(event) => void sendAlliance(event)}
                className="min-h-11 border border-[var(--ash-olive)] px-4 text-sm uppercase tracking-[0.14em] disabled:opacity-60"
              >
                Post to alliance
              </button>
            ) : null}
          </div>
        </form>
      </section>

      <section className="ash-frame p-4" data-testid="mail-inbox">
        <p className="ash-label mb-3">Inbox</p>
        {desk.inbox.length === 0 ? (
          <p className="text-sm text-[var(--ash-muted)]">No messages yet.</p>
        ) : (
          <ul className="space-y-3">
            {desk.inbox.map((item) => (
              <li
                key={item.id}
                className="border-b border-[var(--ash-border)] pb-3 last:border-b-0 last:pb-0"
                data-testid="mail-item"
                data-read={item.read ? "true" : "false"}
                data-kind={item.kind}
              >
                <p className="font-mono text-xs uppercase tracking-[0.12em] text-[var(--ash-muted)]">
                  {item.kind === "ALLIANCE" ? `Alliance${item.allianceTag ? ` · [${item.allianceTag}]` : ""}` : "Direct"}
                  {" · "}
                  {item.you ? "you" : item.fromCallsign}
                  {item.read ? "" : " · unread"}
                </p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-[var(--ash-beige)]">{item.body}</p>
                {!item.read ? (
                  <button
                    type="button"
                    disabled={pending}
                    data-testid="mail-read"
                    onClick={() => void markRead(item.id)}
                    className="mt-2 min-h-10 border border-[var(--ash-border)] px-3 text-xs uppercase tracking-[0.12em]"
                  >
                    Mark read
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
