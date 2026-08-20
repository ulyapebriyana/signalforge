// ==UserScript==
// @name         Meteora Quick Presets (Safe Review)
// @namespace    local.signalforge
// @version      0.2.4
// @description  Quick-fill SOL amount, range, and strategy on Meteora DLMM. Never confirms or signs a transaction.
// @author       Local
// @match        https://meteora.ag/*
// @match        https://www.meteora.ag/*
// @match        https://app.meteora.ag/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(() => {
  "use strict";

  const PANEL_ID = "meteora-quick-presets";
  const STYLE_ID = `${PANEL_ID}-styles`;
  const STORAGE_KEY = "meteoraQuickPresets.v1";
  const OWNED_ATTR = "data-mqp-owned";

  if (document.getElementById(PANEL_ID)) return;

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const normalize = (value) => String(value ?? "").replace(/\s+/g, " ").trim().toLowerCase();

  function isVisible(element) {
    if (!(element instanceof HTMLElement)) return false;
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
  }

  function pageButtons() {
    return [...document.querySelectorAll("button, [role='button']")].filter(
      (element) => !element.closest(`[${OWNED_ATTR}]`) && isVisible(element),
    );
  }

  function buttonLabel(element) {
    return normalize(element.innerText || element.getAttribute("aria-label") || element.textContent);
  }

  function findButton(pattern) {
    return pageButtons().find((element) => pattern.test(buttonLabel(element)));
  }

  function inputContext(input) {
    const id = input.id;
    const explicitLabel = id ? document.querySelector(`label[for="${CSS.escape(id)}"]`) : null;
    const wrappingLabel = input.closest("label");
    const ancestorText = [];
    let ancestor = input;
    for (let depth = 0; depth < 6 && ancestor; depth += 1, ancestor = ancestor.parentElement) {
      ancestorText.push(ancestor.textContent?.slice(0, 260));
    }
    return normalize([
      input.getAttribute("aria-label"),
      input.getAttribute("placeholder"),
      input.getAttribute("name"),
      input.getAttribute("id"),
      explicitLabel?.textContent,
      wrappingLabel?.textContent,
      ...ancestorText,
    ].filter(Boolean).join(" "));
  }

  function closestTextDistance(input, pattern, maxDepth = 7) {
    let ancestor = input;
    for (let depth = 0; depth <= maxDepth && ancestor; depth += 1, ancestor = ancestor.parentElement) {
      if (pattern.test(normalize(ancestor.textContent))) return depth;
    }
    return Number.POSITIVE_INFINITY;
  }

  function visiblePageInputs() {
    return [...document.querySelectorAll("input")].filter(
      (input) => !input.closest(`[${OWNED_ATTR}]`) && isVisible(input) && !input.disabled,
    );
  }

  function findInput({ required = [], preferred = [], rejected = [] }) {
    const candidates = visiblePageInputs()
      .map((input) => {
        const context = inputContext(input);
        if (rejected.some((term) => context.includes(term))) return null;
        if (!required.every((term) => context.includes(term))) return null;
        const score = preferred.reduce((total, term) => total + (context.includes(term) ? 1 : 0), 0);
        return { input, score, context };
      })
      .filter(Boolean)
      .sort((a, b) => b.score - a.score);

    return candidates[0]?.input ?? null;
  }

  function setReactInputValue(input, value) {
    const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
    input.focus();
    descriptor?.set?.call(input, String(value));
    input.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: String(value) }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    input.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Enter", code: "Enter" }));
    input.dispatchEvent(new KeyboardEvent("keypress", { bubbles: true, key: "Enter", code: "Enter" }));
    input.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true, key: "Enter", code: "Enter" }));
    input.blur();
  }

  async function waitFor(find, timeoutMs = 4000) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
      const result = find();
      if (result) return result;
      await sleep(100);
    }
    return null;
  }

  function readSettings(panel) {
    return {
      amount: panel.querySelector("[data-field='amount']").value.trim(),
      min: panel.querySelector("[data-field='min']").value.trim(),
      max: panel.querySelector("[data-field='max']").value.trim(),
      strategy: panel.querySelector("[data-field='strategy']").value,
    };
  }

  function validateSettings(settings) {
    const amount = Number(settings.amount);
    const min = Number(settings.min);
    const max = Number(settings.max);
    if (!Number.isFinite(amount) || amount <= 0) throw new Error("Jumlah SOL harus lebih besar dari 0.");
    if (!Number.isFinite(min) || !Number.isFinite(max)) throw new Error("Min% dan Max% harus berupa angka.");
    if (min >= max) throw new Error("Min% harus lebih kecil daripada Max%.");
    if (min < -95 || max > 300) throw new Error("Range terlalu ekstrem. Gunakan Min ≥ -95% dan Max ≤ 300%.");
    return { amount, min, max, strategy: settings.strategy };
  }

  function saveSettings(settings) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  }

  function loadSettings() {
    try {
      return { amount: "0.04", min: "-15", max: "15", strategy: "Spot", ...JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}") };
    } catch {
      return { amount: "0.04", min: "-15", max: "15", strategy: "Spot" };
    }
  }

  function setStatus(panel, message, type = "neutral") {
    const status = panel.querySelector("[data-role='status']");
    status.textContent = message;
    status.dataset.type = type;
  }

  function highlight(element) {
    if (!element) return;
    element.scrollIntoView({ behavior: "smooth", block: "center" });
    const previousOutline = element.style.outline;
    const previousOffset = element.style.outlineOffset;
    element.style.outline = "3px solid #f97316";
    element.style.outlineOffset = "3px";
    setTimeout(() => {
      element.style.outline = previousOutline;
      element.style.outlineOffset = previousOffset;
    }, 5000);
  }

  async function openPositionEditor() {
    const create = findButton(/^(create position|ape in)(\s|$)/i);
    if (!create) return false;
    create.click();
    await sleep(500);
    return true;
  }

  async function chooseStrategy(strategy) {
    const wanted = normalize(strategy).replace(/-/g, " ");
    const button = pageButtons().find(
      (element) => buttonLabel(element).replace(/-/g, " ") === wanted,
    );
    if (!button) return false;
    button.click();
    return Boolean(await waitFor(() => {
      const labelIsActive = [...button.querySelectorAll("span")].some(
        (span) => buttonLabel(span) === wanted && /text-(?:v2-)?text-primary/.test(span.className),
      );
      return button.querySelector(".is-active") || labelIsActive;
    }, 1500));
  }

  function findAmountInput() {
    const candidates = visiblePageInputs()
      .filter((input) => {
        const context = inputContext(input);
        const placeholder = normalize(input.getAttribute("placeholder"));
        return placeholder === "0.00" && !/slippage|price impact/.test(context);
      })
      .map((input) => ({ input, distance: closestTextDistance(input, /sol/) }))
      .filter(({ distance }) => Number.isFinite(distance))
      .sort((a, b) => a.distance - b.distance);

    return candidates[0]?.input ?? null;
  }

  function findPercentInput(kind) {
    const isMin = kind === "min";
    const labelPattern = isMin ? /min price/ : /max price/;
    const candidates = visiblePageInputs()
      .filter((input) => String(input.value).trim().endsWith("%"))
      .map((input) => ({ input, distance: closestTextDistance(input, labelPattern) }))
      .filter(({ distance }) => Number.isFinite(distance))
      .sort((a, b) => a.distance - b.distance);

    return candidates[0]?.input ?? null;
  }

  function percentValue(input) {
    return Number.parseFloat(String(input?.value ?? "").replace("%", "").replace(",", "."));
  }

  function percentIsClose(input, target) {
    const actual = percentValue(input);
    return Number.isFinite(actual) && Math.abs(actual - target) <= 1.25;
  }

  async function applyPreset(panel) {
    const settings = validateSettings(readSettings(panel));
    saveSettings(settings);
    setStatus(panel, "Mencari formulir posisi Meteora…");

    let amountInput = findAmountInput();
    let minInput = findPercentInput("min");
    let maxInput = findPercentInput("max");

    if (!amountInput || !minInput || !maxInput) {
      await openPositionEditor();
      amountInput = await waitFor(findAmountInput);
      minInput = await waitFor(() => findPercentInput("min"));
      maxInput = await waitFor(() => findPercentInput("max"));
    }

    const missing = [];
    if (!amountInput) missing.push("Amount SOL");
    if (!minInput) missing.push("Min%");
    if (!maxInput) missing.push("Max%");
    if (missing.length) {
      throw new Error(`Kolom ${missing.join(", ")} belum ditemukan. Buka Create Position/Ape In, lalu coba lagi.`);
    }

    setReactInputValue(amountInput, settings.amount);
    // Meteora recalculates its default range after Amount changes. Give that
    // state update time to finish before applying the user's manual range.
    await sleep(700);
    minInput = findPercentInput("min");
    maxInput = findPercentInput("max");
    if (!minInput || !maxInput) throw new Error("Kolom Min%/Max% menghilang setelah Amount diisi. Coba sekali lagi.");

    // React must commit each range endpoint before the other endpoint changes;
    // otherwise the second update can restore the previous value.
    for (let attempt = 0; attempt < 3; attempt += 1) {
      minInput = findPercentInput("min");
      if (!minInput) throw new Error("Kolom Min% menghilang. Coba sekali lagi.");
      if (!percentIsClose(minInput, settings.min)) {
        setReactInputValue(minInput, settings.min);
        await sleep(700);
      }

      maxInput = findPercentInput("max");
      if (!maxInput) throw new Error("Kolom Max% menghilang. Coba sekali lagi.");
      if (!percentIsClose(maxInput, settings.max)) {
        setReactInputValue(maxInput, settings.max);
        await sleep(700);
      }

      minInput = findPercentInput("min");
      maxInput = findPercentInput("max");
      if (percentIsClose(minInput, settings.min) && percentIsClose(maxInput, settings.max)) break;
    }

    if (!percentIsClose(minInput, settings.min) || !percentIsClose(maxInput, settings.max)) {
      throw new Error(
        `Range belum tersimpan benar (terbaca ${minInput?.value || "?"} → ${maxInput?.value || "?"}). Jangan lanjut transaksi; coba sekali lagi.`,
      );
    }

    const strategyApplied = await chooseStrategy(settings.strategy);

    await sleep(300);
    minInput = findPercentInput("min") || minInput;
    maxInput = findPercentInput("max") || maxInput;
    const reviewButton = findButton(/^(add liquidity|review|preview|ape in)(\s|$)/i);
    highlight(reviewButton || amountInput);
    setStatus(
      panel,
      `Terisi: ${amountInput.value || settings.amount} SOL, ${minInput.value} → ${maxInput.value}, ${settings.strategy}${strategyApplied ? "" : " (pilih strategi manual)"}. Periksa form lalu klik transaksi sendiri.`,
      "success",
    );
  }

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      #${PANEL_ID} { position: fixed; right: 18px; bottom: 18px; z-index: 2147483646; width: 330px; color: #f8fafc; font: 600 13px/1.35 Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
      #${PANEL_ID} * { box-sizing: border-box; }
      #${PANEL_ID} .mqp-card { background: rgba(23, 23, 38, .96); border: 1px solid rgba(148, 163, 184, .25); border-radius: 14px; box-shadow: 0 18px 50px rgba(0,0,0,.45); overflow: hidden; backdrop-filter: blur(16px); }
      #${PANEL_ID} .mqp-head { display: flex; align-items: center; justify-content: space-between; padding: 10px 12px; background: linear-gradient(90deg, rgba(249,115,22,.15), rgba(139,92,246,.10)); cursor: move; }
      #${PANEL_ID} .mqp-title { display: flex; align-items: center; gap: 7px; font-weight: 800; }
      #${PANEL_ID} .mqp-dot { width: 9px; height: 9px; border-radius: 999px; background: #f97316; box-shadow: 0 0 12px #f97316; }
      #${PANEL_ID} .mqp-icon { border: 0; color: #94a3b8; background: transparent; cursor: pointer; font-size: 16px; padding: 2px 5px; }
      #${PANEL_ID} .mqp-body { padding: 11px 12px 12px; }
      #${PANEL_ID} .mqp-grid { display: grid; grid-template-columns: 1.25fr 1fr 1fr; gap: 7px; }
      #${PANEL_ID} label { display: grid; gap: 4px; color: #aeb5c5; font-size: 10px; }
      #${PANEL_ID} input, #${PANEL_ID} select { width: 100%; border: 1px solid #41445a; border-radius: 7px; background: #25263a; color: #fff; padding: 8px 9px; font: inherit; outline: none; }
      #${PANEL_ID} input:focus, #${PANEL_ID} select:focus { border-color: #f97316; box-shadow: 0 0 0 2px rgba(249,115,22,.18); }
      #${PANEL_ID} .mqp-presets { display: grid; gap: 5px; margin: 9px 0; }
      #${PANEL_ID} .mqp-preset-row { display: grid; grid-template-columns: 29px repeat(5, 1fr); gap: 5px; align-items: center; }
      #${PANEL_ID} .mqp-preset-label { color: #94a3b8; font-size: 9px; text-align: left; }
      #${PANEL_ID} .mqp-preset { border: 1px solid #41445a; border-radius: 7px; background: #303147; color: #d8dbea; padding: 7px 3px; cursor: pointer; font: inherit; }
      #${PANEL_ID} .mqp-preset:hover { border-color: #f97316; color: #fff; }
      #${PANEL_ID} .mqp-row { display: grid; grid-template-columns: 1fr 1.45fr; gap: 7px; align-items: end; }
      #${PANEL_ID} .mqp-apply { border: 0; border-radius: 8px; background: linear-gradient(90deg, #f97316, #fb923c); color: #17111d; padding: 10px 12px; cursor: pointer; font: inherit; font-weight: 900; line-height: 1.1; box-shadow: 0 7px 18px rgba(249,115,22,.22); }
      #${PANEL_ID} .mqp-apply:hover { filter: brightness(1.08); }
      #${PANEL_ID} .mqp-apply:disabled { opacity: .55; cursor: wait; }
      #${PANEL_ID} .mqp-status { margin-top: 8px; color: #94a3b8; font-size: 10px; font-weight: 500; }
      #${PANEL_ID} .mqp-status[data-type="success"] { color: #4ade80; }
      #${PANEL_ID} .mqp-status[data-type="error"] { color: #fb7185; }
      #${PANEL_ID}[data-collapsed="true"] .mqp-body { display: none; }
      @media (max-width: 640px) { #${PANEL_ID} { right: 8px; bottom: 8px; width: min(330px, calc(100vw - 16px)); } }
    `;
    document.head.appendChild(style);
  }

  function makeDraggable(panel) {
    const handle = panel.querySelector(".mqp-head");
    let drag = null;
    handle.addEventListener("pointerdown", (event) => {
      if (event.target.closest("button")) return;
      const rect = panel.getBoundingClientRect();
      drag = { x: event.clientX - rect.left, y: event.clientY - rect.top };
      handle.setPointerCapture(event.pointerId);
    });
    handle.addEventListener("pointermove", (event) => {
      if (!drag) return;
      panel.style.left = `${Math.max(6, Math.min(innerWidth - panel.offsetWidth - 6, event.clientX - drag.x))}px`;
      panel.style.top = `${Math.max(6, Math.min(innerHeight - panel.offsetHeight - 6, event.clientY - drag.y))}px`;
      panel.style.right = "auto";
      panel.style.bottom = "auto";
    });
    handle.addEventListener("pointerup", () => { drag = null; });
  }

  function mountPanel() {
    injectStyles();
    const initial = loadSettings();
    const panel = document.createElement("aside");
    panel.id = PANEL_ID;
    panel.setAttribute(OWNED_ATTR, "true");
    panel.innerHTML = `
      <div class="mqp-card">
        <div class="mqp-head">
          <div class="mqp-title"><span class="mqp-dot"></span>Meteora QP <span style="color:#94a3b8;font-size:10px">v0.2.4 safe</span></div>
          <button class="mqp-icon" data-role="collapse" title="Ciutkan panel">⌄</button>
        </div>
        <div class="mqp-body">
          <div class="mqp-grid">
            <label>SOL<input data-field="amount" inputmode="decimal" value="${initial.amount}"></label>
            <label>Min %<input data-field="min" inputmode="decimal" value="${initial.min}"></label>
            <label>Max %<input data-field="max" inputmode="decimal" value="${initial.max}"></label>
          </div>
          <div class="mqp-presets" aria-label="Preset batas range">
            <div class="mqp-preset-row">
              <span class="mqp-preset-label">MIN</span>
              ${[5, 10, 15, 20, 25].map((value) => `<button class="mqp-preset" data-min="${value}">−${value}</button>`).join("")}
            </div>
            <div class="mqp-preset-row">
              <span class="mqp-preset-label">MAX</span>
              ${[10, 15, 20, 25, 30].map((value) => `<button class="mqp-preset" data-max="${value}">+${value}</button>`).join("")}
            </div>
          </div>
          <div class="mqp-row">
            <label>Strategi
              <select data-field="strategy">
                <option${initial.strategy === "Spot" ? " selected" : ""}>Spot</option>
                <option${initial.strategy === "Bid-Ask" ? " selected" : ""}>Bid-Ask</option>
                <option${initial.strategy === "Curve" ? " selected" : ""}>Curve</option>
              </select>
            </label>
            <button class="mqp-apply" data-role="apply">Siapkan Ape In</button>
          </div>
          <div class="mqp-status" data-role="status">Hanya mengisi form. Konfirmasi transaksi tetap manual.</div>
        </div>
      </div>
    `;

    panel.querySelectorAll("[data-min]").forEach((button) => {
      button.addEventListener("click", () => {
        const min = Number(button.dataset.min);
        panel.querySelector("[data-field='min']").value = String(-min);
        setStatus(panel, `Batas bawah −${min}% dipilih.`);
      });
    });

    panel.querySelectorAll("[data-max]").forEach((button) => {
      button.addEventListener("click", () => {
        const max = Number(button.dataset.max);
        panel.querySelector("[data-field='max']").value = String(max);
        setStatus(panel, `Batas atas +${max}% dipilih.`);
      });
    });

    panel.querySelector("[data-role='collapse']").addEventListener("click", () => {
      const collapsed = panel.dataset.collapsed === "true";
      panel.dataset.collapsed = String(!collapsed);
      panel.querySelector("[data-role='collapse']").textContent = collapsed ? "⌄" : "⌃";
    });

    const apply = panel.querySelector("[data-role='apply']");
    apply.addEventListener("click", async () => {
      apply.disabled = true;
      try {
        await applyPreset(panel);
      } catch (error) {
        setStatus(panel, error instanceof Error ? error.message : String(error), "error");
      } finally {
        apply.disabled = false;
      }
    });

    document.body.appendChild(panel);
    makeDraggable(panel);
  }

  mountPanel();
})();
