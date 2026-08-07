import { FormEvent, useState } from "react";
import { Link } from "react-router-dom";
import "./StaticPage.css";
import "./ContactForm.css";

const SUPPORT_EMAIL = "hello@ariusinteractive.com";
const FORM_NAME = "contact-arleco";

async function submitArlecoContact(fields: {
  name: string;
  email: string;
  topic: string;
  message: string;
}) {
  const body = new URLSearchParams({
    "form-name": FORM_NAME,
    "bot-field": "",
    brand: "[Arleco]",
    subject: "[Arleco] Website contact",
    name: fields.name.trim(),
    email: fields.email.trim(),
    topic: fields.topic.trim(),
    message: fields.message.trim(),
  });
  const res = await fetch("/", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!res.ok) throw new Error("Could not send your message. Email us directly instead.");
}

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
          "Log in with username/password or a magic link to sync progress across devices.",
          "Use save files on a series page for separate playthroughs.",
        ],
      },
      { type: "h2", text: "Creators" },
      {
        type: "ul",
        items: [
          "Open Creator studio to draft chapters on the graph editor.",
          "Validate your graph before publishing a chapter live.",
          "Visit Tutorials for interactive lessons on branching stories.",
        ],
      },
      {
        type: "p",
        text: `Need more help? Use the Contact page or email ${SUPPORT_EMAIL}.`,
      },
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
        text: "We are in early beta. The studio, reader, and creator tools are still evolving, but the stories are real and the creators are independent. Arleco is a product of Arius Interactive.",
      },
    ],
  },
  privacy: {
    title: "Privacy",
    blocks: [
      {
        type: "p",
        text: "We collect account email, optional profile fields, reading progress, and creator project data needed to run the service.",
      },
      { type: "p", text: `We do not sell personal data. Contact ${SUPPORT_EMAIL} for data requests.` },
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
      { type: "p", text: `Questions before you publish? See Help or email ${SUPPORT_EMAIL}.` },
    ],
  },
};

function ContactView() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [topic, setTopic] = useState("General");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await submitArlecoContact({ name, email, topic, message });
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Send failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="static-main container">
      <h1>Contact</h1>
      <p>
        Questions, partnerships, press, login help, or content reports — send a message or email{" "}
        <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.
      </p>

      {done ? (
        <div className="contact-success">
          <h2>Message sent</h2>
          <p>Thanks — we&apos;ll reply to {email}.</p>
        </div>
      ) : (
        <form className="contact-form" onSubmit={(e) => void onSubmit(e)}>
          <label>
            Your name
            <input value={name} onChange={(e) => setName(e.target.value)} required autoComplete="name" />
          </label>
          <label>
            Email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </label>
          <label>
            Topic
            <select value={topic} onChange={(e) => setTopic(e.target.value)}>
              <option>General</option>
              <option>Reader help</option>
              <option>Creator / studio</option>
              <option>Account / login</option>
              <option>Content report</option>
              <option>Press / partnership</option>
            </select>
          </label>
          <label>
            Message
            <textarea rows={6} value={message} onChange={(e) => setMessage(e.target.value)} required />
          </label>
          {error && <p className="contact-error">{error}</p>}
          <button className="contact-submit" type="submit" disabled={busy}>
            {busy ? "Sending…" : "Send message"}
          </button>
        </form>
      )}

      <p className="static-foot">
        <Link to="/discover">Discover</Link> · <Link to="/help">Help</Link>
      </p>
    </main>
  );
}

export function StaticPage({ page }: { page: string }) {
  if (page === "contact") return <ContactView />;

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
        <Link to="/discover">Discover</Link> · <Link to="/help">Help</Link> · <Link to="/contact">Contact</Link>
      </p>
    </main>
  );
}
