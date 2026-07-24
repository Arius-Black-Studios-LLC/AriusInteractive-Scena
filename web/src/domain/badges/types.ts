export type BadgeDefinition = {
  id: string;
  title: string;
  description: string;
  icon: string;
  category: "conservatory" | "playwright" | "house" | string;
};

export type LaurelSummary = {
  unlocked: number;
  total: number;
};
