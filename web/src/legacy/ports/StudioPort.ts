import type { LegacySession } from "../globals.d.ts";

export type StudioRouteView =
  | "dashboard"
  | "account"
  | "graph"
  | "episodes"
  | "settings"
  | "resources";

export interface StudioPort {
  boot(session: LegacySession): Promise<void>;
  navigate(hashPath: string): void;
  showToast(message: string): void;
}
