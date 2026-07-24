import { useDucatBalance } from "../hooks/useDucatBalance";
import "./DucatBalance.css";

type Props = {
  /** Link to wallet top-up / studio shop */
  href?: string;
  className?: string;
};

export function DucatBalance({ href = "/studio#/library/shop", className }: Props) {
  const { balance, userId } = useDucatBalance();

  if (!userId || balance === null) return null;

  const label = balance === 1 ? "1 Ducat" : `${balance.toLocaleString()} Ducats`;

  return (
    <a
      href={href}
      className={`ducat-hud${className ? ` ${className}` : ""}`}
      title="Your Ducat balance — click to get more"
      aria-label={`${label}. Get more Ducats.`}
    >
      <span className="ducat-hud-icon" aria-hidden="true">
        ◆
      </span>
      <span className="ducat-hud-amount">{balance.toLocaleString()}</span>
    </a>
  );
}
