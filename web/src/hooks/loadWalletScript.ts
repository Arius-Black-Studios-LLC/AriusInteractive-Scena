let walletScriptPromise: Promise<void> | null = null;

export function loadWalletScript(): Promise<void> {
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
