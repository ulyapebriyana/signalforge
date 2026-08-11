import { SolanaWalletProvider } from "../lib/wallet.jsx";
import PositionsView from "./PositionsView.jsx";

/**
 * The wallet-aware entry point for the positions page.
 *
 * It exists so the provider and the view land in the same lazily-loaded chunk:
 * ForgeApp imports only this file, and everything the signing path needs —
 * @solana/web3.js, the wallet adapter, the zap out sheet — is reached from
 * here, so none of it appears in the bundle a scanner-only session downloads.
 */
export default function PositionsWorkspace(props) {
  return (
    <SolanaWalletProvider>
      <PositionsView {...props} />
    </SolanaWalletProvider>
  );
}
