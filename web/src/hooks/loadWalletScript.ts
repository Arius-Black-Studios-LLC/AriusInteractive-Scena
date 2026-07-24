let walletScriptPromise: Promise<void> | null = null;

function waitForScenaWallet(attemptsLeft: number): Promise<void> {
  if (window.ScenaWallet) return Promise.resolve();
  if (attemptsLeft <= 0) {
    return Promise.reject(new Error("Wallet failed to load"));
  }
  return new Promise((resolve) => {
    window.setTimeout(() => {
      void waitForScenaWallet(attemptsLeft - 1).then(resolve);
    }, 50);
  });
}

export function loadWalletScript(): Promise<void> {
  if (window.ScenaWallet) return Promise.resolve();
  if (walletScriptPromise) return walletScriptPromise;
  walletScriptPromise = new Promise((resolve, reject) => {
    const src = "/legacy/scena-wallet.js";
    const existing = document.querySelector(`script[data-legacy-src="${src}"]`);
    if (existing) {
      void waitForScenaWallet(80).then(resolve).catch(reject);
      return;
    }
    const el = document.createElement("script");
    el.src = src;
    el.async = true;
    el.dataset.legacySrc = src;
    el.onload = () => {
      void waitForScenaWallet(80).then(resolve).catch(reject);
    };
    el.onerror = () => reject(new Error("Wallet failed to load"));
    document.body.appendChild(el);
  });
  return walletScriptPromise;
}
