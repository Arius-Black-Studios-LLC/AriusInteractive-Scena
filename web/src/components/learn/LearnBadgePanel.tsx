import { BadgeGrid } from "../badges/BadgeGrid";
import { BadgeSummary } from "../badges/BadgeSummary";
import { useBadges } from "../../hooks/useBadges";

export function LearnBadgePanel() {
  const { badges, summary } = useBadges();

  return (
    <section className="learn-badges-section">
      <div className="learn-badges-head">
        <h2>Your laurels</h2>
        <BadgeSummary summary={summary} />
      </div>
      <BadgeGrid badges={badges} />
    </section>
  );
}
