import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { loadWalletScript } from "./loadWalletScript";

export function useDucatBalance() {
  const { userId } = useAuth();
  const [balance, setBalance] = useState<number | null>(null);

  const refresh = useCallback(() => {
    if (!userId) {
      setBalance(null);
      return Promise.resolve(null);
    }
    return loadWalletScript()
      .then(() => window.ScenaWallet!.load(userId))
      .then(() => {
        const next = window.ScenaWallet!.getBalance(userId);
        setBalance(next);
        return next;
      })
      .catch(() => {
        setBalance(null);
        return null;
      });
  }, [userId]);

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

  return { balance, userId, refresh };
}
