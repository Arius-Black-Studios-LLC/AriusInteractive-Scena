import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { loadWalletScript } from "./loadWalletScript";

export function useDucatBalance() {
  const { userId } = useAuth();
  const [balance, setBalance] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(() => {
    if (!userId) {
      setBalance(null);
      setLoading(false);
      return Promise.resolve(null);
    }
    setLoading(true);
    return loadWalletScript()
      .then(() => {
        const cached = window.ScenaWallet!.getBalance(userId);
        setBalance(cached);
        return window.ScenaWallet!.load(userId);
      })
      .then(() => {
        const next = window.ScenaWallet!.getBalance(userId);
        setBalance(next);
        return next;
      })
      .catch(() => {
        const fallback = window.ScenaWallet ? window.ScenaWallet.getBalance(userId) : 0;
        setBalance(fallback);
        return fallback;
      })
      .finally(() => {
        setLoading(false);
      });
  }, [userId]);

  useEffect(() => {
    if (!userId) {
      setBalance(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    loadWalletScript()
      .then(() => {
        if (cancelled) return;
        setBalance(window.ScenaWallet!.getBalance(userId));
        return window.ScenaWallet!.load(userId);
      })
      .then(() => {
        if (!cancelled) setBalance(window.ScenaWallet!.getBalance(userId));
      })
      .catch(() => {
        if (!cancelled) {
          setBalance(window.ScenaWallet ? window.ScenaWallet.getBalance(userId) : 0);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  return { balance, userId, loading, refresh };
}
