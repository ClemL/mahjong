"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface Status {
  enabled: boolean;
  persistent: boolean;
  deployment: { environment: string; commit: string; branch: string };
  variables: Record<string, boolean>;
}

export default function MultiplayerPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<Status | null>(null);
  // A failed status check is its own problem and must not be reported as
  // "multiplayer is switched off" — that sends you looking at env vars when
  // the server is what is broken.
  const [statusError, setStatusError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/rooms", { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw new Error(`the server answered ${r.status}`);
        return (await r.json()) as Status;
      })
      .then((s) => {
        setStatus(s);
        setStatusError(null);
      })
      .catch((e: Error) => setStatusError(e.message));
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

        {statusError ? (
          <p className="lobby__error">
            Could not reach the multiplayer service — {statusError}. This is a server problem, not
            a missing setting.
          </p>
        ) : null}

        {status && !status.enabled ? (
          <div className="lobby__error">
            <p style={{ margin: "0 0 6px" }}>
              This deployment has no <code>MAHJONG_ROOM_PASSWORD</code>, so multiplayer is off.
            </p>
            <p style={{ margin: 0 }}>
              It is answering from <b>{status.deployment.environment}</b>, branch{" "}
              <b>{status.deployment.branch}</b>, commit <b>{status.deployment.commit}</b>. Vercel
              fixes environment variables at deploy time, so if you added the variable after that
              commit was built, redeploy and it will be picked up.
            </p>
          </div>
        ) : null}
        {status ? (
          <details className="lobby__diag">
            <summary>Deployment status</summary>
            <ul className="lobby__diaglist">
              <li>
                Environment: <b>{status.deployment.environment}</b> · branch{" "}
                <b>{status.deployment.branch}</b> · commit <b>{status.deployment.commit}</b>
              </li>
              {Object.entries(status.variables).map(([name, present]) => (
                <li key={name}>
                  <code>{name}</code>: <b>{present ? "set" : "missing"}</b>
                </li>
              ))}
            </ul>
          </details>
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
