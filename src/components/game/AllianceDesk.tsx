"use client";

import { useState } from "react";
import type { AllianceDesk as AllianceDeskData } from "@/game/domain/types";

type ApiError = { ok: false; message?: string; code?: string };

function newActionId(): string {
  return crypto.randomUUID();
}

export function AllianceDesk({ initial }: { initial: AllianceDeskData }) {
  const [desk, setDesk] = useState(initial);
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState("Alliance channel open.");
  const [tag, setTag] = useState("");
  const [name, setName] = useState("");
  const [inviteCallsign, setInviteCallsign] = useState("");

  async function send(path: string, body: unknown): Promise<AllianceDeskData | null> {
    setPending(true);
    try {
      const response = await fetch(path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await response.json()) as ApiError | { ok: true; alliance: AllianceDeskData };
      if (!response.ok || !("alliance" in data)) {
        setFeedback("message" in data ? data.message ?? "Alliance command rejected." : "Alliance command rejected.");
        return null;
      }
      setDesk(data.alliance);
      return data.alliance;
    } finally {
      setPending(false);
    }
  }

  async function found(event: React.FormEvent) {
    event.preventDefault();
    const next = await send("/api/game/alliance", {
      actionId: newActionId(),
      payload: { tag, name },
    });
    if (next?.alliance) {
      setFeedback(`Founded [${next.alliance.tag}] ${next.alliance.name}.`);
      setTag("");
      setName("");
    }
  }

  async function invite(event: React.FormEvent) {
    event.preventDefault();
    const next = await send("/api/game/alliance/invite", {
      actionId: newActionId(),
      payload: { callsign: inviteCallsign },
    });
    if (next) {
      setFeedback(`Invite sent to ${inviteCallsign.trim()}.`);
      setInviteCallsign("");
    }
  }

  async function respond(inviteId: string, accept: boolean) {
    const next = await send("/api/game/alliance/respond", {
      actionId: newActionId(),
      payload: { inviteId, accept },
    });
    if (next) {
      setFeedback(accept ? "Joined the alliance." : "Invite declined.");
    }
  }

  async function leave() {
    const next = await send("/api/game/alliance/leave", { actionId: newActionId() });
    if (next) {
      setFeedback("Left the alliance.");
    }
  }

  async function kick(callsign: string) {
    const next = await send("/api/game/alliance/kick", {
      actionId: newActionId(),
      payload: { callsign },
    });
    if (next) {
      setFeedback(`Dismissed ${callsign}.`);
    }
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-[var(--ash-muted)]" data-testid="alliance-feedback">
        {feedback}
      </p>

      {desk.incoming.length > 0 ? (
        <section className="ash-frame p-4" data-testid="alliance-invites">
          <p className="ash-label mb-3">Incoming invites</p>
          <ul className="space-y-3">
            {desk.incoming.map((invite) => (
              <li key={invite.id} className="flex flex-wrap items-center justify-between gap-3">
                <p className="font-mono text-sm text-[var(--ash-beige)]">
                  [{invite.tag}] {invite.name} · from {invite.fromCallsign}
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={pending}
                    data-testid="alliance-accept"
                    onClick={() => void respond(invite.id, true)}
                    className="min-h-10 border border-[var(--ash-olive)] px-3 text-xs uppercase tracking-[0.12em]"
                  >
                    Accept
                  </button>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => void respond(invite.id, false)}
                    className="min-h-10 border border-[var(--ash-border)] px-3 text-xs uppercase tracking-[0.12em]"
                  >
                    Decline
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {desk.alliance ? (
        <section className="ash-frame p-4" data-testid="alliance-roster">
          <p className="ash-label">Current alliance</p>
          <h2 className="mt-2 font-mono text-2xl text-[var(--ash-beige)]" data-testid="alliance-tag">
            [{desk.alliance.tag}] {desk.alliance.name}
          </h2>
          <p className="mt-1 font-mono text-xs uppercase tracking-[0.12em] text-[var(--ash-muted)]">
            {desk.alliance.role === "LEADER" ? "You hold the lead." : "You serve as a member."}
          </p>
          <ul className="mt-4 space-y-2">
            {desk.alliance.members.map((member) => (
              <li
                key={member.callsign}
                className="flex flex-wrap items-center justify-between gap-3 font-mono text-sm"
                data-testid="alliance-member"
              >
                <span>
                  {member.callsign}
                  {member.you ? " · you" : ""} · {member.role === "LEADER" ? "Leader" : "Member"}
                </span>
                {desk.alliance?.role === "LEADER" && !member.you ? (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => void kick(member.callsign)}
                    className="min-h-10 border border-[var(--ash-border)] px-3 text-xs uppercase tracking-[0.12em]"
                  >
                    Dismiss
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
          {desk.outgoing.length > 0 ? (
            <p className="mt-4 font-mono text-xs uppercase tracking-[0.12em] text-[var(--ash-muted)]">
              Pending: {desk.outgoing.map((row) => row.callsign).join(", ")}
            </p>
          ) : null}
          {desk.alliance.role === "LEADER" ? (
            <form className="mt-5 flex flex-wrap gap-3" onSubmit={(event) => void invite(event)}>
              <input
                value={inviteCallsign}
                onChange={(event) => setInviteCallsign(event.target.value)}
                minLength={3}
                maxLength={16}
                required
                placeholder="Callsign"
                data-testid="alliance-invite-input"
                className="min-h-11 min-w-48 border border-[var(--ash-border)] bg-black/30 px-3 text-[var(--ash-text)]"
              />
              <button
                type="submit"
                disabled={pending}
                data-testid="alliance-invite"
                className="min-h-11 border border-[var(--ash-olive)] px-4 text-sm uppercase tracking-[0.14em] disabled:opacity-60"
              >
                Invite
              </button>
            </form>
          ) : null}
          <button
            type="button"
            disabled={pending}
            data-testid="alliance-leave"
            onClick={() => void leave()}
            className="mt-5 min-h-11 border border-[var(--ash-danger)] px-4 text-sm uppercase tracking-[0.14em] disabled:opacity-60"
          >
            Leave alliance
          </button>
        </section>
      ) : (
        <section className="ash-frame p-4">
          <p className="ash-label">Found an alliance</p>
          <p className="mt-2 max-w-xl text-sm text-[var(--ash-muted)]">
            A tag is public on the map and standings. Allies cannot raid each other. Stockpiles stay private.
          </p>
          <form className="mt-4 flex flex-wrap gap-3" onSubmit={(event) => void found(event)}>
            <input
              value={tag}
              onChange={(event) => setTag(event.target.value.toUpperCase())}
              minLength={3}
              maxLength={5}
              required
              placeholder="TAG"
              data-testid="alliance-tag-input"
              className="min-h-11 w-28 border border-[var(--ash-border)] bg-black/30 px-3 uppercase text-[var(--ash-text)]"
            />
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              minLength={3}
              maxLength={24}
              required
              placeholder="Alliance name"
              data-testid="alliance-name-input"
              className="min-h-11 min-w-48 border border-[var(--ash-border)] bg-black/30 px-3 text-[var(--ash-text)]"
            />
            <button
              type="submit"
              disabled={pending}
              data-testid="alliance-found"
              className="min-h-11 border border-[var(--ash-rust)] px-4 text-sm uppercase tracking-[0.14em] disabled:opacity-60"
            >
              Found alliance
            </button>
          </form>
        </section>
      )}
    </div>
  );
}
