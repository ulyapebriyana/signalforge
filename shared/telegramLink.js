/**
 * What the bot should do about one Telegram update.
 *
 * Kept apart from the transport so the handshake can be tested without a bot
 * token: the interesting part is not the HTTP call but the decision — a chat
 * only becomes a subscriber while the dashboard has a link window open, and
 * the two chat shapes announce themselves in completely different ways.
 */

/** A channel cannot run commands, so being promoted is how it says yes. */
const JOINED = new Set(["administrator", "member", "creator"]);
const LEFT = new Set(["left", "kicked"]);

export const NO_WINDOW_REPLY =
  "<b>Belum ada permintaan koneksi.</b>\nBuka dashboard SignalForge → Pengaturan → Hubungkan Telegram, lalu tekan tombolnya dalam 10 menit.";
export const ALREADY_REPLY = "<b>Sudah tersambung.</b>\nChat ini sudah menerima alert SignalForge.";
export const STOPPED_REPLY = "<b>Koneksi diputus.</b>\nChat ini tidak lagi menerima alert.";
export const NOT_CONNECTED_REPLY = "Chat ini memang belum tersambung.";

/**
 * @param update  a raw Telegram update
 * @param context.linkCode   the open window's code, or null when none is open
 * @param context.isSubscribed  does this chat already receive alerts
 * @returns {{action: "connect"|"disconnect"|"reply"|"ignore", chat?: object, text?: string}}
 */
export const routeUpdate = (update, { linkCode = null, isSubscribed = () => false } = {}) => {
  const message = update?.message || update?.channel_post;
  const chat = message?.chat || update?.my_chat_member?.chat;
  if (!chat) return { action: "ignore" };

  const text = String(message?.text || "").trim();

  if (text.startsWith("/start")) {
    const payload = text.slice("/start".length).trim();
    // A bare /start counts while a window is open: someone who opened the bot
    // by hand and pressed Start has made the same statement of intent as the
    // deep link, and refusing them would look like the feature is broken.
    if (linkCode && (!payload || payload === linkCode)) return { action: "connect", chat };
    if (isSubscribed(chat.id)) return { action: "reply", chat, text: ALREADY_REPLY };
    return { action: "reply", chat, text: NO_WINDOW_REPLY };
  }

  if (text.startsWith("/stop")) {
    return isSubscribed(chat.id)
      ? { action: "disconnect", chat, text: STOPPED_REPLY }
      : { action: "reply", chat, text: NOT_CONNECTED_REPLY };
  }

  const status = update?.my_chat_member?.new_chat_member?.status;
  if (status && JOINED.has(status)) {
    // Without an open window this is just someone adding the bot somewhere;
    // adopting that chat would let any group the bot is dropped into start
    // receiving the alerts.
    return linkCode ? { action: "connect", chat } : { action: "ignore" };
  }
  if (status && LEFT.has(status)) {
    return isSubscribed(chat.id) ? { action: "disconnect", chat, text: null } : { action: "ignore" };
  }

  return { action: "ignore" };
};
