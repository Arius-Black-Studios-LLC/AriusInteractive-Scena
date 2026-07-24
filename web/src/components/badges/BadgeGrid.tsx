import { BadgeCard } from "./BadgeCard";
import type { BadgeViewModel } from "../../hooks/useBadges";

type Props = {
  badges: BadgeViewModel[];
};

export function BadgeGrid({ badges }: Props) {
  return (
    <div className="badge-grid">
      {badges.map((badge) => (
        <BadgeCard key={badge.id} badge={badge} />
      ))}
    </div>
  );
}
