import { FormEvent, useState } from "react";
import { useAuth } from "../context/AuthContext";
import "./LoginModal.css";

const CONFIG_HINT =
  "Supabase is not configured. Keys load automatically from docs/scena-config.js in dev — restart npm run dev after editing that file. For production, set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in web/.env or Netlify env vars.";

type Props = {
  open: boolean;
  onClose: () => void;
  postLogin?: string;
};

export function LoginModal({ open, onClose, postLogin }: Props) {
  const { signIn, configured, loading } = useAuth();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  if (!open) return null;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      if (!loading && !configured) {
        setError(CONFIG_HINT);
        return;
      }
      let dest = postLogin;
      if (!dest) {
        try {
          dest = sessionStorage.getItem("scena_post_login") || undefined;
        } catch {
          /* private mode */
        }
      }
      await signIn(email.trim(), "reader", dest);
      setSent(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not send magic link.";
      setError(msg.includes("not configured") ? CONFIG_HINT : msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop is-open" onClick={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-labelledby="loginTitle"
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
          ×
        </button>
        <h2 id="loginTitle">Log in to Arleco</h2>
        {sent ? (
          <p className="modal-success">
            Check your email — we sent a magic link to <strong>{email}</strong>.
          </p>
        ) : (
          <form onSubmit={handleSubmit}>
            <label className="field">
              <span>Email</span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                autoFocus
              />
            </label>
            {error ? <p className="field-error">{error}</p> : null}
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {busy ? "Sending…" : "Send magic link"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
