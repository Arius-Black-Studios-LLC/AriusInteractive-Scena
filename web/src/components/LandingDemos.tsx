import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import "./LandingDemos.css";

type SceneChoice = {
  label: string;
  response: string;
  speaker?: string;
};

const SCENE_LINES = [
  { speaker: "Celeste", text: "The chamber feels different tonight — like the walls are listening." },
  { speaker: "Celeste", text: "Every choice you make here echoes into the next scene." },
];

const SCENE_CHOICES: SceneChoice[] = [
  {
    label: "Step closer to the circle",
    response: "Warm light spills across the floor. A path opens you didn't notice before.",
    speaker: "Narrator",
  },
  {
    label: "Ask who else is here",
    response: "A voice answers from the shadows — not hostile, just waiting for your move.",
    speaker: "???",
  },
];

export function LandingDemos() {
  const [lineIdx, setLineIdx] = useState(0);
  const [choiceResponse, setChoiceResponse] = useState<SceneChoice | null>(null);
  const [typedLen, setTypedLen] = useState(0);

  const activeLine = choiceResponse
    ? { speaker: choiceResponse.speaker || "Narrator", text: choiceResponse.response }
    : SCENE_LINES[lineIdx]!;

  useEffect(() => {
    setTypedLen(0);
    const id = window.setInterval(() => {
      setTypedLen((n) => {
        if (n >= activeLine.text.length) {
          window.clearInterval(id);
          return n;
        }
        return n + 1;
      });
    }, 28);
    return () => window.clearInterval(id);
  }, [activeLine.text]);

  useEffect(() => {
    if (choiceResponse) return;
    const id = window.setInterval(() => {
      setLineIdx((i) => (i + 1) % SCENE_LINES.length);
    }, 5200);
    return () => window.clearInterval(id);
  }, [choiceResponse]);

  function pickChoice(choice: SceneChoice) {
    setChoiceResponse(choice);
  }

  function resetScene() {
    setChoiceResponse(null);
    setLineIdx(0);
  }

  return (
    <section className="landing-demos section container" aria-labelledby="landing-demos-title">
      <div className="landing-demos-head">
        <p className="landing-demos-eyebrow">See it in action</p>
        <h2 id="landing-demos-title">Read, branch, and create</h2>
        <p className="landing-demos-lede">
          Arleco is a visual novel platform — stories play in the browser, choices branch the plot,
          and creators wire scenes in a graph editor.
        </p>
      </div>

      <div className="landing-demos-grid">
        <div className="landing-demo-scene" aria-label="Interactive story preview">
          <div className="landing-demo-stage">
            <img
              className="landing-demo-bg"
              src="/landing-demo-chamber.png"
              alt=""
              aria-hidden="true"
            />
            <img
              className="landing-demo-character"
              src="/landing-demo-character.png"
              alt=""
              aria-hidden="true"
            />
            <div className="landing-demo-dialogue">
              <span className="landing-demo-speaker">{activeLine.speaker}</span>
              <p className="landing-demo-text">
                {activeLine.text.slice(0, typedLen)}
                {typedLen < activeLine.text.length ? (
                  <span className="landing-demo-cursor" aria-hidden="true">
                    |
                  </span>
                ) : null}
              </p>
            </div>
          </div>
          <div className="landing-demo-choices">
            {choiceResponse ? (
              <button type="button" className="landing-demo-choice" onClick={resetScene}>
                Replay scene
              </button>
            ) : (
              SCENE_CHOICES.map((choice) => (
                <button
                  key={choice.label}
                  type="button"
                  className="landing-demo-choice"
                  onClick={() => pickChoice(choice)}
                >
                  {choice.label}
                </button>
              ))
            )}
          </div>
          <p className="landing-demo-caption">Tap a choice — the scene responds like a real chapter.</p>
        </div>

        <div className="landing-demo-cards">
          <article className="landing-demo-card">
            <span className="landing-demo-card-icon" aria-hidden="true">
              ◆
            </span>
            <h3>Create branching stories</h3>
            <p>
              Wire beats, choices, and metrics in the creator studio. Preview episodes before you
              publish a chapter live.
            </p>
            <Link className="landing-demo-link" to="/studio">
              Open creator studio →
            </Link>
          </article>

          <article className="landing-demo-card">
            <span className="landing-demo-card-icon" aria-hidden="true">
              ✦
            </span>
            <h3>Learn step by step</h3>
            <p>
              New to interactive fiction? Tutorials walk you through the editor — cast characters,
              branch dialogue, publish your first episode.
            </p>
            <Link className="landing-demo-link" to="/tutorials">
              Start tutorials →
            </Link>
          </article>

          <article className="landing-demo-card landing-demo-card--discover">
            <span className="landing-demo-card-icon" aria-hidden="true">
              ★
            </span>
            <h3>Discover indie series</h3>
            <p>
              Browse episodic visual novels from independent creators — romance, mystery, fantasy,
              and more.
            </p>
            <Link className="landing-demo-link" to="/discover">
              Browse stories →
            </Link>
          </article>
        </div>
      </div>
    </section>
  );
}
