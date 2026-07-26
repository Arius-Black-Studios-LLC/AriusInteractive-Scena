import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { loadWalletScript } from "./loadWalletScript";

export function useDucatBalance() {
  const { userId } = useAuth();
  const [balance, setBalance] = useState<number | null>(null);
  const [creatorEarned, setCreatorEarned] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  const applyWallet = useCallback((uid: string) => {
    setBalance(window.ScenaWallet!.getBalance(uid));
    setCreatorEarned(window.ScenaWallet!.getCreatorEarned(uid));
  }, []);

  const refresh = useCallback(() => {
    if (!userId) {
      setBalance(null);
      setCreatorEarned(null);
      setLoading(false);
      return Promise.resolve(null);
    }
    setLoading(true);
    return loadWalletScript()
      .then(() => {
        applyWallet(userId);
        return window.ScenaWallet!.load(userId);
      })
      .then(() => {
        applyWallet(userId);
        return window.ScenaWallet!.getBalance(userId);
      })
      .catch(() => {
        if (window.ScenaWallet) applyWallet(userId);
        return window.ScenaWallet ? window.ScenaWallet.getBalance(userId) : 0;
      })
      .finally(() => {
        setLoading(false);
      });
  }, [userId, applyWallet]);

  useEffect(() => {
    if (!userId) {
      setBalance(null);
      setCreatorEarned(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    loadWalletScript()
      .then(() => {
        if (cancelled) return;
        applyWallet(userId);
        return window.ScenaWallet!.load(userId);
      })
      .then(() => {
        if (!cancelled) applyWallet(userId);
      })
      .catch(() => {
        if (!cancelled && window.ScenaWallet) applyWallet(userId);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [userId, applyWallet]);

  useEffect(() => {
    function onWalletChange(e: Event) {
      const detail = (e as CustomEvent<{ userId?: string; balance?: number; creatorEarned?: number }>).detail;
      if (!userId || detail?.userId !== userId) return;
      if (detail.balance != null) setBalance(detail.balance);
      if (detail.creatorEarned != null) setCreatorEarned(detail.creatorEarned);
    }
    window.addEventListener("scena-wallet-change", onWalletChange);
    return () => window.removeEventListener("scena-wallet-change", onWalletChange);
  }, [userId]);

  return { balance, creatorEarned, userId, loading, refresh };
}
