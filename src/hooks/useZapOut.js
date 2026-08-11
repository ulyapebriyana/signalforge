import { useCallback, useState } from "react";
import { summarizeExecution } from "../../shared/zapOut.js";

const postJson = async (url, body) => {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "Permintaan gagal");
  return payload;
};

/**
 * Driving a zap out from the browser, one signature at a time.
 *
 * Transactions pass through here as opaque base64: the server builds them and
 * relays them, the wallet signs them, and nothing in between needs to parse
 * one. That is what keeps @solana/web3.js out of the browser bundle.
 *
 * The order is forced by the chain, not by preference. The swap cannot be built
 * until the withdrawal has landed, because until then the tokens are still in
 * the position and the wallet's balance would price the swap at zero. So this
 * runs as two committed phases with a real gap between them.
 *
 * That gap is why failure is reported so carefully. A withdrawal that lands and
 * a swap that does not leaves the user holding two tokens instead of one — an
 * outcome that is recoverable but must be *stated*, never rounded off to
 * "gagal". The same goes for a withdrawal that only partly lands, which is
 * possible whenever a position spans more bins than one transaction can carry.
 */
export function useZapOut({ wallet, signTransactions, onDone }) {
  const [phase, setPhase] = useState("idle");
  const [steps, setSteps] = useState([]);
  const [error, setError] = useState("");
  const [signatures, setSignatures] = useState([]);

  const reset = useCallback(() => {
    setPhase("idle");
    setSteps([]);
    setError("");
    setSignatures([]);
  }, []);

  /**
   * The swap on its own.
   *
   * Separate from `execute` because it is the recovery path: when a withdrawal
   * lands and the swap does not — the likeliest failure, since the price only
   * has to drift past the slippage bound — the position is already closed and
   * re-running the withdrawal would be both wrong and impossible. The server
   * still holds what the swap needs, so this finishes the job.
   */
  const runSwap = useCallback(
    async ({ positionKey, landed = [] }) => {
      setPhase("swap-preparing");
      const swap = await postJson("/api/lp/zap-out/swap", { wallet, positionKey });

      if (swap.skipped) {
        // Nothing left to swap is a complete zap out, not a failure: the
        // position was already sitting entirely on the target side.
        setPhase("done");
        onDone?.();
        return { ok: true, swapped: false, signatures: landed, note: swap.reason };
      }

      setPhase("swap-signing");
      const [signed] = await signTransactions([swap.transaction]);

      setPhase("swapping");
      const { signature } = await postJson("/api/lp/send", {
        signedTransaction: signed,
        wallet,
        finishesPositionKey: positionKey,
      });
      landed.push(signature);
      setSignatures([...landed]);

      setPhase("done");
      onDone?.();
      return { ok: true, swapped: true, signatures: landed };
    },
    [onDone, signTransactions, wallet],
  );

  const execute = useCallback(
    async ({ positionKey, targetMint, slippageBps }) => {
      const landed = [];
      setError("");
      setSignatures([]);

      try {
        /* --- withdraw ---------------------------------------------------- */
        setPhase("preparing");
        const withdraw = await postJson("/api/lp/zap-out/withdraw", {
          wallet,
          positionKey,
          targetMint,
          slippageBps,
        });
        const unsigned = withdraw.transactions.map((item) => item.transaction);

        setPhase("signing");
        setSteps(unsigned.map(() => ({ status: "pending" })));
        const signed = await signTransactions(unsigned);

        setPhase("withdrawing");
        for (const [index, transaction] of signed.entries()) {
          try {
            const { signature } = await postJson("/api/lp/send", {
              signedTransaction: transaction,
              // The transaction's own blockhash, so a dropped one fails when it
              // really expired rather than waiting out an unrelated window.
              blockhash: withdraw.blockhash,
              lastValidBlockHeight: withdraw.lastValidBlockHeight,
            });
            landed.push(signature);
            setSignatures([...landed]);
            setSteps((current) => current.map((step, at) => (at === index ? { status: "confirmed" } : step)));
          } catch (sendError) {
            setSteps((current) => current.map((step, at) => (at === index ? { status: "failed" } : step)));
            throw sendError;
          }
        }

        /* --- swap -------------------------------------------------------- */
        return await runSwap({ positionKey, landed });
      } catch (runError) {
        const message = runError?.message || "Zap out gagal";
        setError(message);
        // Anything that already landed decides how this reads. Money has moved;
        // saying only "gagal" would hide that, and the user needs to know
        // before they consider running it again.
        setPhase(landed.length ? "partial" : "failed");
        return { ok: false, swapped: false, signatures: landed, error: message };
      }
    },
    [runSwap, signTransactions, wallet],
  );

  /** Retry just the swap after a partial run, keeping the signatures already earned. */
  const resumeSwap = useCallback(
    async ({ positionKey }) => {
      setError("");
      const landed = [...signatures];
      try {
        return await runSwap({ positionKey, landed });
      } catch (runError) {
        const message = runError?.message || "Swap gagal";
        setError(message);
        setPhase("partial");
        return { ok: false, swapped: false, signatures: landed, error: message };
      }
    },
    [runSwap, signatures],
  );

  return {
    phase,
    steps,
    error,
    signatures,
    execute,
    resumeSwap,
    reset,
    summary: summarizeExecution(steps),
  };
}
