/**
 * Telegram delivery: who receives alerts, and how they sign themselves up.
 *
 * Recipients used to be a single TELEGRAM_CHAT_ID in .env, so adding a channel
 * meant editing a file on the VPS and restarting the process. Here the bot
 * long-polls getUpdates instead, and the dashboard opens a short-lived "link
 * window": whatever chat answers the bot while that window is open becomes a
 * subscriber. That covers both shapes Telegram gives us — a private chat
 * replies with `/start <code>`, while a channel cannot run commands at all and
 * announces itself through `my_chat_member` when the bot is added as admin.
 *
 * The bot token stays server-side. It is the app's identity rather than a per
 * user setting, so .env still wins when it has one; the in-app field exists so
 * a fresh install can be finished without shell access.
 */
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { routeUpdate } from "../shared/telegramLink.js";

const API = "https://api.telegram.org";
/**
 * 10 minutes. Long enough to switch to Telegram, find the channel and promote
 * the bot; short enough that a window left open by a closed tab cannot quietly
 * adopt an unrelated chat hours later.
 */
const LINK_WINDOW_MS = 10 * 60_000;
const POLL_TIMEOUT_SECONDS = 25;

let storeFile = null;
let store = { botToken: null, subscribers: [] };
let writeQueue = Promise.resolve();
let botInfo = null;
let botInfoToken = null;
let pendingLink = null;
let polling = false;
let updateOffset = 0;
/** Last chat that connected, so the dashboard can name it in a toast. */
let lastConnected = null;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const envToken = () => (process.env.TELEGRAM_BOT_TOKEN || "").trim();
const envChatId = () => (process.env.TELEGRAM_CHAT_ID || "").trim();

/** .env wins: it is the deployment's own choice and cannot be overwritten by a browser. */
export const botToken = () => envToken() || store.botToken || "";
export const botTokenFromEnv = () => Boolean(envToken());

const persist = () => {
  if (!storeFile) return;
  const snapshot = JSON.stringify(store, null, 2);
  writeQueue = writeQueue
    .then(async () => {
      await mkdir(path.dirname(storeFile), { recursive: true });
      const temporaryFile = `${storeFile}.tmp`;
      await writeFile(temporaryFile, snapshot, "utf8");
      await rename(temporaryFile, storeFile);
    })
    .catch(() => console.warn("Telegram subscribers could not be saved."));
};

const escapeHtml = (value) => String(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;");

/**
 * A chat from .env is listed alongside the connected ones so the panel tells
 * the whole truth about where alerts land, but it is not removable from the
 * browser — the file would just put it back on the next restart.
 */
export const subscribers = () => {
  const list = store.subscribers.map((entry) => ({ ...entry, source: "app", removable: true }));
  const legacy = envChatId();
  if (legacy && !list.some((entry) => String(entry.id) === legacy)) {
    list.unshift({
      id: legacy,
      title: "Chat dari .env",
      type: "unknown",
      connectedAt: null,
      source: "env",
      removable: false,
    });
  }
  return list;
};

export const telegramConfigured = () => Boolean(botToken()) && subscribers().length > 0;

const callApi = async (method, body, timeoutMs = 15_000) => {
  const token = botToken();
  if (!token) throw new Error("Bot Telegram belum diatur");
  const response = await fetch(`${API}/bot${token}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body ?? {}),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.ok) {
    const error = new Error(payload?.description || `Telegram menolak ${method}`);
    error.status = response.status;
    error.description = payload?.description || "";
    throw error;
  }
  return payload.result;
};

/** getMe, cached per token so the deep link can carry the bot's real @username. */
export const resolveBotInfo = async () => {
  const token = botToken();
  if (!token) return null;
  if (botInfo && botInfoToken === token) return botInfo;
  const me = await callApi("getMe");
  botInfo = { id: me.id, username: me.username, name: me.first_name };
  botInfoToken = token;
  return botInfo;
};

const chatTitle = (chat) => {
  if (chat.title) return chat.title;
  const name = [chat.first_name, chat.last_name].filter(Boolean).join(" ").trim();
  if (name) return name;
  return chat.username ? `@${chat.username}` : `Chat ${chat.id}`;
};

const addSubscriber = (chat) => {
  const id = String(chat.id);
  const entry = {
    id,
    title: chatTitle(chat),
    type: chat.type || "private",
    username: chat.username || null,
    connectedAt: new Date().toISOString(),
  };
  const index = store.subscribers.findIndex((item) => item.id === id);
  // A reconnect refreshes the title rather than duplicating the row: channels
  // get renamed, and two entries for one chat would double every alert.
  if (index >= 0) store.subscribers[index] = { ...store.subscribers[index], ...entry };
  else store.subscribers.push(entry);
  persist();
  lastConnected = { ...entry, at: Date.now() };
  return entry;
};

export const removeSubscriber = (id) => {
  const key = String(id);
  const before = store.subscribers.length;
  store.subscribers = store.subscribers.filter((entry) => entry.id !== key);
  if (store.subscribers.length !== before) persist();
  return store.subscribers.length !== before;
};

/* --- link window --------------------------------------------------------- */

const linkWindowOpen = () => Boolean(pendingLink) && pendingLink.expiresAt > Date.now();

export const pendingLinkState = () => {
  if (!linkWindowOpen()) return null;
  return {
    code: pendingLink.code,
    url: pendingLink.url,
    expiresAt: pendingLink.expiresAt,
  };
};

/**
 * Open a window and hand back the deep link that fills it.
 *
 * The code is only ever checked against one open window, so it does not need
 * to be a secret over time — it needs to be unguessable for the ten minutes it
 * exists, which 16 hex characters comfortably are.
 */
export const startLink = async () => {
  const info = await resolveBotInfo();
  if (!info?.username) throw new Error("Bot Telegram tidak dapat dibaca. Periksa token bot.");
  const code = randomBytes(8).toString("hex");
  pendingLink = {
    code,
    url: `https://t.me/${info.username}?start=${code}`,
    expiresAt: Date.now() + LINK_WINDOW_MS,
  };
  // The loop may have been idling on a missing token until now.
  startPolling();
  return { ...pendingLinkState(), botUsername: info.username };
};

export const cancelLink = () => {
  pendingLink = null;
};

/** Consumed by the dashboard poll, so one connect is announced exactly once. */
export const takeLastConnected = () => {
  if (!lastConnected) return null;
  const entry = lastConnected;
  lastConnected = null;
  return entry;
};

/* --- update handling ----------------------------------------------------- */

const reply = async (chatId, text) => {
  try {
    await callApi("sendMessage", { chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true });
  } catch {
    // A channel where the bot lacks post rights is the normal case here; the
    // dashboard already reports the connection, so silence is correct.
  }
};

const connectChat = async (chat) => {
  const entry = addSubscriber(chat);
  pendingLink = null;
  await reply(
    chat.id,
    `<b>SignalForge tersambung.</b>\nAlert Meteora akan dikirim ke <b>${escapeHtml(entry.title)}</b>.\nKirim /stop untuk berhenti.`,
  );
};

const isSubscribed = (id) => store.subscribers.some((entry) => entry.id === String(id));

const handleUpdate = async (update) => {
  const decision = routeUpdate(update, {
    linkCode: linkWindowOpen() ? pendingLink.code : null,
    isSubscribed,
  });

  if (decision.action === "connect") {
    await connectChat(decision.chat);
    return;
  }
  if (decision.action === "disconnect") {
    removeSubscriber(decision.chat.id);
    if (decision.text) await reply(decision.chat.id, decision.text);
    return;
  }
  if (decision.action === "reply") await reply(decision.chat.id, decision.text);
};

/* --- polling ------------------------------------------------------------- */

const startPolling = () => {
  if (polling) return;
  polling = true;
  void (async () => {
    let backoffMs = 1_000;
    for (;;) {
      if (!botToken()) {
        await sleep(5_000);
        continue;
      }
      try {
        const updates = await callApi(
          "getUpdates",
          {
            offset: updateOffset,
            timeout: POLL_TIMEOUT_SECONDS,
            allowed_updates: ["message", "channel_post", "my_chat_member"],
          },
          (POLL_TIMEOUT_SECONDS + 10) * 1_000,
        );
        backoffMs = 1_000;
        for (const update of updates) {
          updateOffset = update.update_id + 1;
          try {
            await handleUpdate(update);
          } catch {
            // One malformed update must not stall the offset and replay forever.
          }
        }
      } catch (error) {
        // 409 means a webhook owns this bot, 401 a bad token — both are states a
        // human has to fix, so back off rather than hammering the API.
        if (backoffMs === 1_000 && error?.status && error.status !== 502) {
          console.warn(`Telegram getUpdates: ${error.description || error.message}`);
        }
        await sleep(backoffMs);
        backoffMs = Math.min(backoffMs * 2, 60_000);
      }
    }
  })();
};

/* --- sending ------------------------------------------------------------- */

const DEAD_CHAT = /bot was blocked|chat not found|bot was kicked|user is deactivated|have no rights|not enough rights|CHAT_WRITE_FORBIDDEN/i;

/**
 * Fan one alert out to every connected chat.
 *
 * Resolves when at least one chat took it, and throws only when none did, so a
 * dead channel alongside a live one still counts as delivered. Chats Telegram
 * reports as gone are dropped here rather than left to fail on every future
 * alert — the user removed the bot, which is the same statement as /stop.
 */
export const sendTelegram = async (text) => {
  if (!botToken()) throw new Error("Bot Telegram belum diatur.");
  const targets = subscribers();
  if (!targets.length) throw new Error("Belum ada channel Telegram yang tersambung.");

  let delivered = 0;
  let lastError = null;
  for (const target of targets) {
    try {
      await callApi("sendMessage", {
        chat_id: target.id,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      });
      delivered += 1;
    } catch (error) {
      lastError = error;
      if (target.removable && DEAD_CHAT.test(error?.description || error?.message || "")) {
        removeSubscriber(target.id);
      }
    }
  }
  if (!delivered) throw new Error(lastError?.description || lastError?.message || "Telegram menolak pesan.");
  return { delivered };
};

/* --- setup --------------------------------------------------------------- */

/** Saves a token typed into the dashboard, after proving it works. */
export const saveBotToken = async (token) => {
  const trimmed = String(token || "").trim();
  if (botTokenFromEnv()) throw new Error("Token bot sudah diatur lewat .env di server ini.");
  if (!/^\d+:[\w-]{30,}$/.test(trimmed)) throw new Error("Format token bot tidak dikenali.");
  const previous = store.botToken;
  store.botToken = trimmed;
  botInfo = null;
  try {
    const info = await resolveBotInfo();
    persist();
    startPolling();
    return info;
  } catch (error) {
    store.botToken = previous;
    botInfo = null;
    throw new Error(`Token bot ditolak Telegram${error?.description ? `: ${error.description}` : "."}`);
  }
};

export const clearBotToken = () => {
  if (botTokenFromEnv()) throw new Error("Token bot diatur lewat .env dan tidak bisa dihapus dari sini.");
  store.botToken = null;
  store.subscribers = [];
  botInfo = null;
  pendingLink = null;
  persist();
};

export const initTelegram = async (file) => {
  storeFile = file;
  try {
    const parsed = JSON.parse(await readFile(file, "utf8"));
    store = {
      botToken: typeof parsed?.botToken === "string" ? parsed.botToken : null,
      subscribers: Array.isArray(parsed?.subscribers) ? parsed.subscribers.filter((entry) => entry?.id) : [],
    };
  } catch (error) {
    if (error?.code !== "ENOENT") console.warn("Telegram subscribers could not be loaded.");
  }
  startPolling();
};
