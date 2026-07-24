import type { BadgeViewModel } from "../../hooks/useBadges";

type Props = {
  badge: BadgeViewModel;
};

export function BadgeCard({ badge }: Props) {
  return (
    <div
      className={`badge-card${badge.unlocked ? " is-unlocked" : " is-locked"}`}
      title={badge.description}
    >
      <div className="badge-icon" aria-hidden="true">
        {badge.icon}
      </div>
      <div className="badge-meta">
        <strong>{badge.title}</strong>
        <span>{badge.description}</span>
      </div>
    </div>
  );
}
