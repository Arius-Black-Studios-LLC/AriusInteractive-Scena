import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";

let walletScriptPromise: Promise<void> | null = null;

function loadWalletScript(): Promise<void> {
  if (window.ScenaWallet) return Promise.resolve();
  if (walletScriptPromise) return walletScriptPromise;
  walletScriptPromise = new Promise((resolve, reject) => {
    const src = "/legacy/scena-wallet.js";
    if (document.querySelector(`script[data-legacy-src="${src}"]`)) {
      resolve();
      return;
    }
    const el = document.createElement("script");
    el.src = src;
    el.async = true;
    el.dataset.legacySrc = src;
    el.onload = () => resolve();
    el.onerror = () => reject(new Error("Wallet failed to load"));
    document.body.appendChild(el);
  });
  return walletScriptPromise;
}

export function useDucatBalance() {
  const { userId } = useAuth();
  const [balance, setBalance] = useState<number | null>(null);

  useEffect(() => {
    if (!userId) {
      setBalance(null);
      return;
    }
    let cancelled = false;
    loadWalletScript()
      .then(() => window.ScenaWallet!.load(userId))
      .then(() => {
        if (!cancelled) setBalance(window.ScenaWallet!.getBalance(userId));
      })
      .catch(() => {
        if (!cancelled) setBalance(null);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  return { balance, userId };
}
