import { describe, expect, it } from "vitest";
import { ALREADY_REPLY, NO_WINDOW_REPLY, routeUpdate, STOPPED_REPLY } from "./telegramLink.js";

const CODE = "abc123";
const privateChat = { id: 42, type: "private", first_name: "Ulya" };
const channel = { id: -100999, type: "channel", title: "Yanman Signals" };

const message = (chat, text) => ({ update_id: 1, message: { chat, text } });
const promotion = (chat, status) => ({
  update_id: 1,
  my_chat_member: { chat, new_chat_member: { status } },
});

const subscribed = (...ids) => (id) => ids.includes(id);

describe("routeUpdate", () => {
  it("connects a private chat that answers the deep link", () => {
    const decision = routeUpdate(message(privateChat, `/start ${CODE}`), { linkCode: CODE });
    expect(decision).toEqual({ action: "connect", chat: privateChat });
  });

  it("connects a bare /start while a window is open", () => {
    expect(routeUpdate(message(privateChat, "/start"), { linkCode: CODE }).action).toBe("connect");
  });

  it("refuses a code that does not match the open window", () => {
    const decision = routeUpdate(message(privateChat, "/start wrong"), { linkCode: CODE });
    expect(decision.action).toBe("reply");
    expect(decision.text).toBe(NO_WINDOW_REPLY);
  });

  it("refuses /start when no window is open", () => {
    const decision = routeUpdate(message(privateChat, `/start ${CODE}`), { linkCode: null });
    expect(decision.action).toBe("reply");
    expect(decision.text).toBe(NO_WINDOW_REPLY);
  });

  it("tells an already-connected chat rather than reconnecting it", () => {
    const decision = routeUpdate(message(privateChat, "/start"), {
      linkCode: null,
      isSubscribed: subscribed(42),
    });
    expect(decision.text).toBe(ALREADY_REPLY);
  });

  it("connects a channel when the bot is promoted during a window", () => {
    const decision = routeUpdate(promotion(channel, "administrator"), { linkCode: CODE });
    expect(decision).toEqual({ action: "connect", chat: channel });
  });

  it("ignores a promotion with no window open", () => {
    expect(routeUpdate(promotion(channel, "administrator"), { linkCode: null }).action).toBe("ignore");
  });

  it("disconnects a chat that kicks the bot", () => {
    const decision = routeUpdate(promotion(channel, "kicked"), {
      linkCode: null,
      isSubscribed: subscribed(-100999),
    });
    expect(decision).toEqual({ action: "disconnect", chat: channel, text: null });
  });

  it("disconnects on /stop and confirms it", () => {
    const decision = routeUpdate(message(channel, "/stop"), {
      linkCode: CODE,
      isSubscribed: subscribed(-100999),
    });
    expect(decision.action).toBe("disconnect");
    expect(decision.text).toBe(STOPPED_REPLY);
  });

  it("does not connect a chat that merely talks to the bot", () => {
    expect(routeUpdate(message(privateChat, "halo"), { linkCode: CODE }).action).toBe("ignore");
  });

  it("ignores an update with no chat at all", () => {
    expect(routeUpdate({ update_id: 1 }, { linkCode: CODE }).action).toBe("ignore");
  });
});
