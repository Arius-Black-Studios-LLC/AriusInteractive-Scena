type Props = {
  completed: number;
  total: number;
};

export function LearnProgressBar({ completed, total }: Props) {
  const pct = Math.round((completed / Math.max(1, total)) * 100);
  return (
    <>
      <div className="learn-progress-bar">
        <div className="learn-progress-fill" style={{ width: `${pct}%` }} />
      </div>
      <p className="learn-progress-text">
        {completed} of {total} acts mastered
      </p>
    </>
  );
}
