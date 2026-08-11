import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { getWallets } from "@wallet-standard/app";

/**
 * Wallet access built straight on the Wallet Standard.
 *
 * The obvious choice was @solana/wallet-adapter-react, and it was tried first.
 * It drags in the mobile adapter, which depends on react-native — in a browser
 * build that resolved React to null and broke every hook in the tree, and it
 * was most of a 400 kB chunk. The standard underneath it is what wallets
 * actually implement, and this page needs three things from it: list wallets,
 * connect, sign. That is small enough to hold directly.
 *
 * Signing here is byte-in, byte-out. The server serialises transactions and
 * relays them, so the browser never needs @solana/web3.js to build or inspect
 * one — which keeps another large dependency out of the bundle entirely.
 */

const CONNECT = "standard:connect";
const DISCONNECT = "standard:disconnect";
const SIGN = "solana:signTransaction";
const SOLANA_MAINNET = "solana:mainnet";

const WalletContext = createContext(null);

/** A wallet is only usable here if it can both connect and sign. */
const isUsable = (wallet) => Boolean(wallet.features?.[CONNECT] && wallet.features?.[SIGN]);

/** The account this wallet exposes for mainnet, if it has one. */
const mainnetAccount = (wallet) =>
  wallet.accounts?.find((account) => account.chains?.includes(SOLANA_MAINNET)) || wallet.accounts?.[0] || null;

export function SolanaWalletProvider({ children }) {
  const [available, setAvailable] = useState([]);
  const [wallet, setWallet] = useState(null);
  const [account, setAccount] = useState(null);
  const [connecting, setConnecting] = useState(false);

  // Wallets register asynchronously as their extensions boot, so the list is
  // seeded from whatever is already there and then kept in sync.
  useEffect(() => {
    const registry = getWallets();
    const sync = () => setAvailable(registry.get().filter(isUsable));
    sync();
    const offRegister = registry.on("register", sync);
    const offUnregister = registry.on("unregister", sync);
    return () => {
      offRegister();
      offUnregister();
    };
  }, []);

  const connect = useCallback(async (target) => {
    setConnecting(true);
    try {
      const result = await target.features[CONNECT].connect();
      const connected = result?.accounts?.[0] || mainnetAccount(target);
      if (!connected) throw new Error("Wallet tidak mengembalikan akun.");
      setWallet(target);
      setAccount(connected);
      return connected;
    } finally {
      setConnecting(false);
    }
  }, []);

  const disconnect = useCallback(async () => {
    try {
      await wallet?.features?.[DISCONNECT]?.disconnect?.();
    } catch {
      // Some wallets have no disconnect feature; dropping our own state is
      // what "putuskan" means from this page's side either way.
    }
    setWallet(null);
    setAccount(null);
  }, [wallet]);

  /**
   * Sign a batch, returning base64 in the same order.
   *
   * The standard takes every transaction in one call, which is what gives the
   * user a single approval prompt for a withdrawal that needs several — being
   * asked to approve the same action twice reads as a bug.
   */
  const signTransactions = useCallback(
    async (base64List) => {
      if (!wallet || !account) throw new Error("Wallet belum tersambung.");
      const inputs = base64List.map((base64) => ({
        account,
        transaction: Uint8Array.from(atob(base64), (character) => character.charCodeAt(0)),
        chain: SOLANA_MAINNET,
      }));

      const outputs = await wallet.features[SIGN].signTransaction(...inputs);
      return outputs.map((output) => {
        let binary = "";
        for (const byte of output.signedTransaction) binary += String.fromCharCode(byte);
        return btoa(binary);
      });
    },
    [account, wallet],
  );

  const value = useMemo(
    () => ({
      available,
      walletName: wallet?.name ?? null,
      address: account?.address ?? null,
      connected: Boolean(wallet && account),
      connecting,
      connect,
      disconnect,
      signTransactions,
    }),
    [account, available, connect, connecting, disconnect, signTransactions, wallet],
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet() {
  const context = useContext(WalletContext);
  if (!context) throw new Error("useWallet dipakai di luar SolanaWalletProvider");
  return context;
}
