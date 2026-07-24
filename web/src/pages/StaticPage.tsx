import { Link } from "react-router-dom";
import "./StaticPage.css";

type Block =
  | { type: "p"; text: string }
  | { type: "h2"; text: string }
  | { type: "ul"; items: string[] };

const PAGES: Record<string, { title: string; blocks: Block[] }> = {
  help: {
    title: "Help center",
    blocks: [
      { type: "p", text: "Quick answers for readers and creators using Arleco in early beta." },
      { type: "h2", text: "Readers" },
      {
        type: "ul",
        items: [
          "Browse Discover for live series — no account required to start reading.",
          "Log in with a magic link to sync progress across devices.",
          "Use save files on a series page for separate playthroughs.",
        ],
      },
      { type: "h2", text: "Creators" },
      {
        type: "ul",
        items: [
          "Open Creator studio to draft chapters on the graph editor.",
          "Validate your graph before publishing a chapter live.",
          "Visit the Conservatory for interactive lessons on stagecraft.",
        ],
      },
      { type: "p", text: "Need more help? Email hello@arleco.app or join our Discord community." },
    ],
  },
  about: {
    title: "About Arleco",
    blocks: [
      {
        type: "p",
        text: "Arleco is an indie platform for episodic visual novels — human-written stories with meaningful choices, published in the browser.",
      },
      {
        type: "p",
        text: "We are in early beta. The studio, reader, and creator tools are still evolving, but the stories are real and the creators are independent.",
      },
    ],
  },
  contact: {
    title: "Contact",
    blocks: [
      { type: "p", text: "Questions, partnerships, or press — reach us at hello@arleco.app." },
      { type: "p", text: "For login issues, request a fresh magic link from the Discover page." },
    ],
  },
  privacy: {
    title: "Privacy",
    blocks: [
      {
        type: "p",
        text: "We collect account email, optional profile fields, reading progress, and creator project data needed to run the service.",
      },
      { type: "p", text: "We do not sell personal data. Contact hello@arleco.app for data requests." },
    ],
  },
  terms: {
    title: "Terms of use",
    blocks: [
      {
        type: "p",
        text: "By using Arleco you agree to publish and read human-made fiction only — no AI-generated story content on the platform.",
      },
      { type: "p", text: "Creators retain rights to their work; you grant Arleco a license to host and display it." },
    ],
  },
  "content-guidelines": {
    title: "Content guidelines",
    blocks: [
      { type: "p", text: "All published stories must be primarily human-written and labeled appropriately for mature themes." },
      { type: "p", text: "Questions before you publish? See Help or email hello@arleco.app." },
    ],
  },
};

export function StaticPage({ page }: { page: keyof typeof PAGES }) {
  const content = PAGES[page];
  if (!content) {
    return (
      <main className="static-main container">
        <h1>Not found</h1>
        <Link to="/">Home</Link>
      </main>
    );
  }

  return (
    <main className="static-main container">
        <h1>{content.title}</h1>
        {content.blocks.map((block, i) => {
          if (block.type === "h2") return <h2 key={i}>{block.text}</h2>;
          if (block.type === "ul") {
            return (
              <ul key={i}>
                {block.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            );
          }
          return <p key={i}>{block.text}</p>;
        })}
        <p className="static-foot">
          <Link to="/">Discover</Link> · <Link to="/help">Help</Link>
      </p>
    </main>
  );
}
