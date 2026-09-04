"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function MultiplayerPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ enabled: boolean; persistent: boolean } | null>(null);

  useEffect(() => {
    fetch("/api/rooms")
      .then((r) => r.json())
      .then(setStatus)
      .catch(() => setStatus({ enabled: false, persistent: false }));
  }, []);

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/rooms", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const body = (await response.json()) as { id?: string; error?: string };
      if (!response.ok || !body.id) setError(body.error ?? "Could not open a room");
      else router.push(`/room/${body.id}`);
    } catch {
      setError("Could not reach the server");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="app">
      <div className="lobby">
        <h1 className="lobby__title">Play together</h1>
        <p className="lobby__lead">
          Open a room, put the code on the shared tablet, and everyone joins from their phone.
          Seats nobody takes are played by the computer.
        </p>

        {status && !status.enabled ? (
          <p className="lobby__error">
            Multiplayer is switched off on this deployment — set <code>MAHJONG_ROOM_PASSWORD</code>{" "}
            to enable it.
          </p>
        ) : null}
        {status?.enabled && !status.persistent ? (
          <p className="lobby__warn">
            No Upstash credentials are configured, so rooms live in server memory. Fine locally;
            in production every request may land on a different instance and rooms will appear to
            vanish. Set <code>UPSTASH_REDIS_REST_URL</code> and <code>UPSTASH_REDIS_REST_TOKEN</code>.
          </p>
        ) : null}

        <div className="lobby__form">
          <label className="field">
            <span className="field__label">Table password</span>
            <input
              className="field__input"
              type="password"
              value={password}
              autoComplete="current-password"
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          <button
            type="button"
            className="btn btn--primary"
            disabled={busy || !status?.enabled}
            onClick={() => void create()}
          >
            Open a new room
          </button>
        </div>

        <form
          className="lobby__form"
          onSubmit={(e) => {
            e.preventDefault();
            if (code.trim()) router.push(`/room/${code.trim().toUpperCase()}`);
          }}
        >
          <label className="field">
            <span className="field__label">Or join with a code</span>
            <input
              className="field__input"
              value={code}
              maxLength={6}
              placeholder="ABCD"
              onChange={(e) => setCode(e.target.value.toUpperCase())}
            />
          </label>
          <button type="submit" className="btn">
            Join
          </button>
        </form>

        {error ? <p className="lobby__error">{error}</p> : null}
        <a className="lobby__link" href="/">
          ← Back to the single-player table
        </a>
      </div>
    </main>
  );
}
