import type { StudioPort } from "../ports/StudioPort";

export const studioAdapter: StudioPort = {
  async boot(session) {
    if (!session?.user?.id) {
      throw new Error("Sign in to open creator studio.");
    }
    if (!window.ScenaStudio?.start) {
      throw new Error("Studio modules failed to load.");
    }

    const store = window.ScenaStore as { ready?: (id: string) => Promise<void> };
    if (store?.ready) {
      await store.ready(session.user.id).catch(() => undefined);
    }

    window.ScenaStudio.start(session);

    return new Promise((resolve) => {
      window.setTimeout(resolve, 0);
    });
  },

  navigate(hashPath) {
    if (window.ScenaStudio?.navigate) {
      window.ScenaStudio.navigate(hashPath);
      return;
    }
    const normalized = hashPath.startsWith("#") ? hashPath : `#${hashPath}`;
    window.location.hash = normalized;
  },

  showToast(message) {
    window.ScenaStudio?.toast?.(message);
  },
};
