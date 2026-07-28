import { useState } from "react";
import { useLegacyBundle } from "../hooks/useLegacyBundle";
import "./AdminDelistControl.css";

export const DELIST_REASONS = [
  "Violates content guidelines",
  "Spam or misleading content",
  "Copyright / intellectual property complaint",
  "Harassment, hate, or threats",
  "Sexual content involving minors",
  "Other policy violation",
] as const;

type TargetType = "series" | "jam" | "listing" | "comment";

type Props = {
  targetType: TargetType;
  targetId: string;
  targetTitle?: string;
  ownerId?: string | null;
  onDone?: () => void;
};

export function AdminDelistControl({
  targetType,
  targetId,
  targetTitle,
  ownerId,
  onDone,
}: Props) {
  const { ready } = useLegacyBundle("admin");
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<string>(DELIST_REASONS[0]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function submit() {
    if (!window.ScenaAdmin || !ready) return;
    setBusy(true);
    setMsg(null);
    try {
      if (targetType === "series") {
        if (!ownerId) throw new Error("Missing series owner.");
        await window.ScenaAdmin.setSeriesModeration!({
          ownerId,
          seriesId: targetId,
          hidden: true,
          reason,
          clearDescriptions: false,
          notifyCreator: true,
          title: targetTitle || "Series",
        });
      } else if (targetType === "jam") {
        await window.ScenaAdmin.hideGameJam!(targetId, reason, {
          notifyCreator: true,
          title: targetTitle || "Game jam",
        });
      } else if (targetType === "listing") {
        await window.ScenaAdmin.removeMarketplaceListing!(targetId, reason, {
          notifyCreator: true,
          title: targetTitle || "Listing",
        });
      } else if (targetType === "comment") {
        await window.ScenaAdmin.hideComment!(targetId, reason);
      }
      setMsg("Delisted. Creator notified.");
      setOpen(false);
      onDone?.();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Could not delist.");
    } finally {
      setBusy(false);
    }
  }

  if (!ready) return null;

  return (
    <div className="admin-delist">
      {!open ? (
        <button type="button" className="btn btn-ghost btn-sm admin-delist-trigger" onClick={() => setOpen(true)}>
          Delist…
        </button>
      ) : (
        <div className="admin-delist-panel">
          <label>
            Reason
            <select value={reason} onChange={(e) => setReason(e.target.value)}>
              {DELIST_REASONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </label>
          <div className="admin-delist-actions">
            <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={submit}>
              {busy ? "Working…" : "Confirm delist"}
            </button>
            <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => setOpen(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}
      {msg ? <p className="admin-delist-msg">{msg}</p> : null}
    </div>
  );
}
