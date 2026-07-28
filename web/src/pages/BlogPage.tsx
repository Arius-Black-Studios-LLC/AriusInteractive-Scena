import { Link } from "react-router-dom";
import "./BlogPage.css";

const POSTS = {
  development: [
    {
      href: "/blog/how-to-make-a-visual-novel.html",
      tag: "Guide",
      title: "How to make a visual novel (complete guide)",
      desc: "From concept to playable chapter — writing, art, branching, and shipping without drowning in scope.",
    },
    {
      href: "/blog/best-visual-novel-engines-compared.html",
      tag: "Engines",
      title: "Best visual novel engines compared",
      desc: "Ren'Py, Unity, Godot, TyranoBuilder, and browser-first tools — honest tradeoffs for indie creators.",
    },
    {
      href: "/blog/visual-novel-development-checklist.html",
      tag: "Checklist",
      title: "Visual novel development checklist",
      desc: "Pre-production through launch — a printable list so nothing falls through the cracks.",
    },
  ],
  writing: [
    {
      href: "/blog/how-to-write-branching-story.html",
      tag: "Branching",
      title: "How to write a branching story that still feels coherent",
      desc: "Plot nodes, meaningful choices, and episode structure for interactive fiction writers.",
    },
  ],
  publishing: [
    {
      href: "/blog/promote-visual-novel-with-game-jams.html",
      tag: "Growth",
      title: "Promote your visual novel for free with game jams",
      desc: "Discover promotion, free-to-read hooks during jams, and a playbook for turning jam readers into series fans.",
    },
    {
      href: "/blog/how-indie-visual-novel-creators-make-money.html",
      tag: "Monetization",
      title: "How indie visual novel creators make money",
      desc: "Arleco marketplace & chapters vs itch, Steam, and Patreon — pros, cons, and why early creators shape the ecosystem.",
    },
    {
      href: "/blog/publish-interactive-fiction-online.html",
      tag: "Publishing",
      title: "How to publish interactive fiction online (without building an app)",
      desc: "Preview, validate, schedule releases, and grow a readership on the web.",
    },
  ],
  basics: [
    {
      href: "/blog/what-is-a-visual-novel.html",
      tag: "Basics",
      title: "What is a visual novel? A reader's guide",
      desc: "Dialogue, choices, and chapters — useful context when you explain your project to players.",
    },
  ],
};

function PostGrid({ posts }: { posts: typeof POSTS.development }) {
  return (
    <div className="blog-grid">
      {posts.map((post) => (
        <a key={post.href} className="blog-card" href={post.href}>
          <div className="blog-card-meta">
            <span className="blog-card-tag">{post.tag}</span>
          </div>
          <h3>{post.title}</h3>
          <p>{post.desc}</p>
        </a>
      ))}
    </div>
  );
}

export function BlogPage() {
  return (
    <main className="blog-main container">
        <h1>For visual novel creators</h1>
        <p className="blog-lede">
          Practical guides for writers, artists, and indie developers building choice-based stories.
        </p>

        <section className="blog-pillar">
          <h2>Development</h2>
          <PostGrid posts={POSTS.development} />
        </section>
        <section className="blog-pillar">
          <h2>Writing</h2>
          <PostGrid posts={POSTS.writing} />
        </section>
        <section className="blog-pillar">
          <h2>Publishing &amp; growth</h2>
          <PostGrid posts={POSTS.publishing} />
        </section>
        <section className="blog-pillar">
          <h2>Interactive fiction</h2>
          <PostGrid posts={POSTS.basics} />
        </section>

        <p className="blog-foot">
          <Link to="/studio">Open creator studio</Link> · <Link to="/discover">Discover stories</Link>
      </p>
    </main>
  );
}
