import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useDucatBalance } from "../hooks/useDucatBalance";
import { loadWalletScript } from "../hooks/loadWalletScript";
import "./DucatBalance.css";

type Props = {
  className?: string;
};

export function DucatBalance({ className }: Props) {
  const { balance, userId, loading, refresh } = useDucatBalance();
  const [open, setOpen] = useState(false);
  const [shopError, setShopError] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const packRootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    if (!open || !userId || !packRootRef.current) return;
    setShopError(null);
    let cancelled = false;
    loadWalletScript()
      .then(() => {
        if (cancelled || !packRootRef.current || !window.ScenaWallet) return;
        packRootRef.current.innerHTML = window.ScenaWallet.renderPackGrid({
          buttonClass: "btn btn-sm btn-secondary ducat-pack-btn",
        });
        window.ScenaWallet.bindPackButtons(
          packRootRef.current,
          userId,
          (result) => {
            if (result?.redirecting) return;
            void refresh();
          },
          (err) => {
            setShopError((err && err.message) || "Could not start checkout.");
          },
        );
      })
      .catch(() => {
        if (!cancelled) setShopError("Wallet failed to load.");
      });
    return () => {
      cancelled = true;
    };
  }, [open, userId, refresh]);

  if (!userId) return null;

  const displayBalance = balance ?? 0;
  const label =
    displayBalance === 1 ? "1 Ducat" : `${displayBalance.toLocaleString()} Ducats`;

  return (
    <div className={`ducat-hud-wrap${className ? ` ${className}` : ""}`} ref={wrapRef}>
      <button
        type="button"
        className="ducat-hud"
        aria-expanded={open}
        aria-haspopup="dialog"
        title="Your Ducat balance — click to buy more"
        aria-label={`${label}. Buy more Ducats.`}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="ducat-hud-icon" aria-hidden="true">
          ◆
        </span>
        <span className="ducat-hud-amount">
          {loading && balance === null ? "…" : displayBalance.toLocaleString()}
        </span>
      </button>
      {open ? (
        <div className="ducat-shop-popover" role="dialog" aria-label="Buy Ducats">
          <div className="ducat-shop-popover-head">
            <strong>Buy Ducats</strong>
            <span className="ducat-shop-balance">{label}</span>
          </div>
          <p className="ducat-shop-hint">Pay with card via Stripe. Ducats credit after payment confirms.</p>
          <div ref={packRootRef} className="ducat-shop-packs" />
          {shopError ? <p className="ducat-shop-error">{shopError}</p> : null}
          <div className="ducat-shop-links">
            <Link to="/studio#/library/shop" onClick={() => setOpen(false)}>
              Asset store &amp; shop
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}
