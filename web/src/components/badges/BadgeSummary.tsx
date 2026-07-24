import type { LaurelSummary } from "../../domain/badges/types";

type Props = {
  summary: LaurelSummary;
};

export function BadgeSummary({ summary }: Props) {
  return (
    <p className="badge-summary-text">
      <strong>{summary.unlocked}</strong> of {summary.total} laurels earned
    </p>
  );
}
