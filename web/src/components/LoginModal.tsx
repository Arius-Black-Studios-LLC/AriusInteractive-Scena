import { FormEvent, useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import "./LoginModal.css";

const CONFIG_HINT =
  "Supabase is not configured for this deploy. Local dev: copy docs/scena-config.example.js to docs/scena-config.js and restart npm run dev. Netlify (including preview builds): set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in Site settings → Environment variables, then add your preview URL (e.g. https://your-branch--site.netlify.app/) to Supabase → Authentication → Redirect URLs.";
type Props = {
  open: boolean;
  onClose: () => void;
  postLogin?: string;
  initialMode?: "login" | "signup";
};

export function LoginModal({ open, onClose, postLogin, initialMode = "login" }: Props) {
  const {
    signInWithPassword,
    signUpWithPassword,
    resetPassword,
    configured,
    loading,
  } = useAuth();
  const [mode, setMode] = useState<"login" | "signup" | "reset">(initialMode);
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setMode(initialMode);
    setMessage("");
    setError("");
    setBusy(false);
  }, [open, initialMode]);

  if (!open) return null;

  function switchMode(next: "login" | "signup" | "reset") {
    setMode(next);
    setMessage("");
    setError("");
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setMessage("");
    setBusy(true);
    try {
      if (!loading && !configured) {
        setError(CONFIG_HINT);
        return;
      }
      if (mode === "reset") {
        await resetPassword(email.trim());
        setMode("login");
        setMessage(
          "Reset link sent. Open it, choose a new password, then log in here with the new one.",
        );
        return;
      }

      if (mode === "signup") {
        const signedIn = await signUpWithPassword({
          email: email.trim(),
          password,
          username: username.trim(),
          role: postLogin === "/studio" ? "creator" : "reader",
        });
        if (!signedIn) {
          setMessage(
            "Account created. Check your email to confirm it, then return here to log in.",
          );
          return;
        }
      } else {
        await signInWithPassword(email.trim(), password);
      }

      onClose();
      window.location.assign(postLogin || "/account");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not authenticate.";
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
        <h2 id="loginTitle">
          {mode === "signup" ? "Create your Arleco account" : mode === "reset" ? "Reset password" : "Log in to Arleco"}
        </h2>
        {!loading && !configured ? (
          <p className="field-error">{CONFIG_HINT}</p>
        ) : null}
        {message ? <p className="modal-success">{message}</p> : null}
        <form onSubmit={handleSubmit}>
          {mode === "signup" ? (
            <label className="field">
              <span>Username</span>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="storyteller"
                minLength={3}
                maxLength={32}
                required
                autoFocus
              />
            </label>
          ) : null}
          <label className="field">
            <span>Email</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              autoFocus={mode !== "signup"}
            />
          </label>
          {mode !== "reset" ? (
            <label className="field">
              <span>Password</span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 8 characters"
                minLength={8}
                required
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
              />
            </label>
          ) : null}
          {error ? <p className="field-error">{error}</p> : null}
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy
              ? "Working…"
              : mode === "signup"
                ? "Create account"
                : mode === "reset"
                  ? "Send reset link"
                  : "Log in"}
          </button>
          <div className="login-mode-links">
            {mode === "login" ? (
              <>
                <button type="button" onClick={() => switchMode("signup")}>Create account</button>
                <button type="button" onClick={() => switchMode("reset")}>Forgot password?</button>
              </>
            ) : (
              <button type="button" onClick={() => switchMode("login")}>Back to log in</button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
