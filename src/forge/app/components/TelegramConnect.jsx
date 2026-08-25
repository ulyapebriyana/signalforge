import { useCallback, useEffect, useRef, useState } from "react";
import {
  Bot,
  Check,
  Copy,
  ExternalLink,
  Hash,
  Loader2,
  Plus,
  Send,
  Trash2,
  User,
  X,
} from "lucide-react";

/**
 * The Telegram connection panel.
 *
 * Connecting is a two-party handshake — the browser opens a window, the answer
 * arrives on the server through the bot — so this polls instead of awaiting a
 * response. It polls hard only while a window is open; the rest of the time it
 * is a slow heartbeat that keeps the chat list honest when a chat is removed
 * from Telegram's side.
 */
const POLL_WAITING_MS = 2_000;
const POLL_IDLE_MS = 30_000;

const CHAT_ICON = { channel: Hash, group: Hash, supergroup: Hash };

const chatKind = (type) => {
  if (type === "channel") return "Channel";
  if (type === "group" || type === "supergroup") return "Grup";
  if (type === "private") return "Chat pribadi";
  return "Chat";
};

/** Env chats have no connect date, so they name their id instead. */
const chatSubtitle = (entry) => {
  if (entry.source === "env") return `Diatur di .env · ID ${entry.id}`;
  const date = new Date(entry.connectedAt);
  const since = Number.isNaN(date.getTime())
    ? ""
    : ` · sejak ${date.toLocaleDateString("id-ID", { day: "numeric", month: "short" })}`;
  return `${chatKind(entry.type)}${since}`;
};

const countdown = (expiresAt) => {
  const left = Math.max(0, expiresAt - Date.now());
  const minutes = Math.floor(left / 60_000);
  const seconds = Math.floor((left % 60_000) / 1_000);
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
};

export default function TelegramConnect({ onToast, onChanged }) {
  const [state, setState] = useState(null);
  const [busy, setBusy] = useState("");
  const [token, setToken] = useState("");
  const [copied, setCopied] = useState(false);
  const [tick, setTick] = useState(0);
  const toastRef = useRef(onToast);
  const changedRef = useRef(onChanged);
  toastRef.current = onToast;
  changedRef.current = onChanged;

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/telegram/connection");
      const payload = await response.json();
      setState(payload);
      // Read-once on the server, so this fires for the connect itself and not
      // for every poll that follows it.
      if (payload.justConnected) {
        toastRef.current(`${payload.justConnected.title} tersambung ke Telegram.`, "success");
        changedRef.current?.();
      }
      return payload;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const waiting = Boolean(state?.pending);

  useEffect(() => {
    const id = setInterval(() => {
      void load();
    }, waiting ? POLL_WAITING_MS : POLL_IDLE_MS);
    return () => clearInterval(id);
  }, [load, waiting]);

  // Drives the countdown text only; the window itself expires on the server.
  useEffect(() => {
    if (!waiting) return undefined;
    const id = setInterval(() => setTick((value) => value + 1), 1_000);
    return () => clearInterval(id);
  }, [waiting]);

  const call = async (label, url, options) => {
    setBusy(label);
    try {
      const response = await fetch(url, options);
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Gagal");
      await load();
      return payload;
    } catch (error) {
      toastRef.current(error.message, "error");
      return null;
    } finally {
      setBusy("");
    }
  };

  const startLink = () => call("link", "/api/telegram/link", { method: "POST" });
  const cancelLink = () => call("cancel", "/api/telegram/link", { method: "DELETE" });

  const disconnect = async (entry) => {
    const done = await call(`drop:${entry.id}`, `/api/telegram/subscribers/${entry.id}`, { method: "DELETE" });
    if (done) {
      toastRef.current(`${entry.title} diputus.`);
      changedRef.current?.();
    }
  };

  const saveToken = async (event) => {
    event.preventDefault();
    const saved = await call("token", "/api/telegram/bot", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token }),
    });
    if (saved) {
      setToken("");
      toastRef.current(`Bot @${saved.bot.username} siap.`, "success");
      changedRef.current?.();
    }
  };

  const sendTest = async () => {
    const sent = await call("test", "/api/telegram/test", { method: "POST" });
    if (sent) toastRef.current(`Pesan tes terkirim ke ${sent.delivered} chat.`, "success");
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(state.pending.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1_600);
    } catch {
      toastRef.current("Browser menolak akses clipboard.", "error");
    }
  };

  const subscribers = state?.subscribers || [];
  const connected = subscribers.length > 0;

  return (
    <section className="fx-panel">
      <header className="fx-panel-head">
        <div>
          <span className="f-eyebrow">Server</span>
          <h2>Telegram</h2>
        </div>
        <Bot />
      </header>

      <div className={`fx-connection ${connected ? "is-connected" : ""}`}>
        <span className="fx-connection-dot" aria-hidden="true" />
        <div>
          <strong>
            {connected
              ? `Tersambung ke ${subscribers.length} chat`
              : state?.botConfigured
                ? "Bot siap, belum ada chat"
                : "Bot belum diatur"}
          </strong>
          <span>
            {!connected
              ? "Hubungkan channel atau chat untuk mulai menerima alert."
              : state?.autoAlertsEnabled
                ? "Alert otomatis aktif dengan cooldown per pool."
                : "Alert otomatis mati. Ubah ENABLE_ALERTS=true lalu restart server."}
          </span>
        </div>
      </div>

      {state && !state.botConfigured ? (
        state.botFromEnv ? (
          <p className="fx-panel-note fx-tg-error">
            Token bot di .env ditolak Telegram{state.botError ? `: ${state.botError}` : "."}
          </p>
        ) : (
          <form className="fx-tg-setup" onSubmit={saveToken}>
            <ol className="fx-tg-steps">
              <li>
                Buka{" "}
                <a href="https://t.me/BotFather" target="_blank" rel="noreferrer">
                  @BotFather
                </a>{" "}
                di Telegram, kirim <code>/newbot</code>, ikuti sampai dapat token.
              </li>
              <li>Tempel token itu di sini. Token hanya disimpan di server ini.</li>
            </ol>
            <div className="fx-tg-token">
              <input
                type="text"
                value={token}
                onChange={(event) => setToken(event.target.value)}
                placeholder="123456789:AA…"
                aria-label="Token bot Telegram"
                spellCheck={false}
                autoComplete="off"
              />
              <button className="f-btn f-btn--hot" type="submit" disabled={!token.trim() || busy === "token"}>
                {busy === "token" ? <Loader2 className="f-spin" /> : <Check />}
                Simpan
              </button>
            </div>
          </form>
        )
      ) : null}

      {subscribers.length ? (
        <ul className="fx-tg-list">
          {subscribers.map((entry) => {
            const Icon = CHAT_ICON[entry.type] || User;
            return (
              <li key={entry.id}>
                <Icon />
                <div>
                  <strong>{entry.title}</strong>
                  <span>{chatSubtitle(entry)}</span>
                </div>
                {entry.removable ? (
                  <button
                    className="f-icon-btn"
                    type="button"
                    onClick={() => disconnect(entry)}
                    disabled={busy === `drop:${entry.id}`}
                    aria-label={`Putuskan ${entry.title}`}
                    title="Putuskan"
                  >
                    {busy === `drop:${entry.id}` ? <Loader2 className="f-spin" /> : <Trash2 />}
                  </button>
                ) : (
                  <span className="fx-tg-locked">.env</span>
                )}
              </li>
            );
          })}
        </ul>
      ) : null}

      {state?.pending ? (
        <div className="fx-tg-waiting" key={tick}>
          <div className="fx-tg-waiting-head">
            <Loader2 className="f-spin" />
            <strong>Menunggu Telegram…</strong>
            <span className="f-num">{countdown(state.pending.expiresAt)}</span>
          </div>
          <ul className="fx-tg-steps">
            <li>
              <b>Chat pribadi:</b> buka tautan di bawah, lalu tekan <b>Start</b>.
            </li>
            <li>
              <b>Channel/grup:</b> buka channel itu → Administrators → tambahkan{" "}
              <b>@{state.bot?.username}</b> sebagai admin dengan izin post.
            </li>
          </ul>
          <div className="fx-tg-waiting-actions">
            <a className="f-btn f-btn--hot" href={state.pending.url} target="_blank" rel="noreferrer">
              <ExternalLink /> Buka Telegram
            </a>
            <button className="f-btn" type="button" onClick={copyLink}>
              {copied ? <Check /> : <Copy />}
              {copied ? "Tersalin" : "Salin tautan"}
            </button>
            <button className="f-btn" type="button" onClick={cancelLink} disabled={busy === "cancel"}>
              <X /> Batal
            </button>
          </div>
        </div>
      ) : null}

      {state?.botConfigured && !state.pending ? (
        <div className="fx-tg-actions">
          <button
            className="f-btn f-btn--hot"
            type="button"
            onClick={startLink}
            disabled={busy === "link"}
          >
            {busy === "link" ? <Loader2 className="f-spin" /> : <Plus />}
            Hubungkan channel
          </button>
          <button className="f-btn" type="button" onClick={sendTest} disabled={!connected || busy === "test"}>
            {busy === "test" ? <Loader2 className="f-spin" /> : <Send />}
            Kirim pesan tes
          </button>
        </div>
      ) : null}

      {state?.bot ? (
        <p className="fx-panel-note">
          Bot <b>@{state.bot.username}</b>
          {state.botFromEnv ? " (token dari .env)" : ""}. Kirim <code>/stop</code> di chat mana pun untuk
          memutus koneksinya sendiri.
        </p>
      ) : null}
    </section>
  );
}
