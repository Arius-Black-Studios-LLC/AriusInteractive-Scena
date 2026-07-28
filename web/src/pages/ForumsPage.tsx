import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import {
  FORUM_CATEGORIES,
  categoryLabel,
  createForumTopic,
  formatForumWhen,
  listForumTopics,
  type ForumTopicListItem,
} from "../lib/forums";
import "./ForumsPage.css";

export function ForumsPage() {
  const { userId, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const category = params.get("category") || "all";

  const [topics, setTopics] = useState<ForumTopicListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [newCategory, setNewCategory] = useState("general");
  const [saving, setSaving] = useState(false);

  const categoryOptions = useMemo(
    () => FORUM_CATEGORIES.filter((c) => c.id !== "all"),
    [],
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    listForumTopics({ category })
      .then((rows) => {
        if (!cancelled) setTopics(rows);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err?.message || "Could not load forums.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [category]);

  function setCategory(next: string) {
    const nextParams = new URLSearchParams(params);
    if (!next || next === "all") nextParams.delete("category");
    else nextParams.set("category", next);
    setParams(nextParams, { replace: true });
  }

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    if (!userId) {
      navigate("/forums?login=1");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const created = await createForumTopic({
        title,
        body,
        category: newCategory,
      });
      navigate(`/forums/${created.id}`);
    } catch (err) {
      setError((err as Error)?.message || "Could not create thread.");
      setSaving(false);
    }
  }

  return (
    <main className="forums-main container">
      <header className="forums-head">
        <div>
          <h1>Forums</h1>
          <p className="forums-lede">
            Start a topic thread — craft tips, jam talk, marketplace questions, and feedback for
            fellow creators.
          </p>
        </div>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => {
            if (!userId) {
              navigate("/forums?login=1");
              return;
            }
            setComposerOpen((v) => !v);
          }}
        >
          {composerOpen ? "Cancel" : "New thread"}
        </button>
      </header>

      <div className="forums-chips" role="tablist" aria-label="Forum categories">
        {FORUM_CATEGORIES.map((c) => (
          <button
            key={c.id}
            type="button"
            role="tab"
            aria-selected={category === c.id}
            className={"forums-chip" + (category === c.id ? " is-active" : "")}
            onClick={() => setCategory(c.id)}
          >
            {c.label}
          </button>
        ))}
      </div>

      {composerOpen ? (
        <form className="forums-composer" onSubmit={onCreate}>
          <h2>Start a thread</h2>
          <label className="forums-field">
            <span>Title</span>
            <input
              type="text"
              maxLength={120}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="What do you want to talk about?"
              required
            />
          </label>
          <label className="forums-field">
            <span>Category</span>
            <select value={newCategory} onChange={(e) => setNewCategory(e.target.value)}>
              {categoryOptions.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
          <label className="forums-field">
            <span>Opening post</span>
            <textarea
              rows={6}
              maxLength={8000}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Share context, a question, or a prompt for replies…"
              required
            />
          </label>
          <div className="forums-composer-actions">
            <button type="submit" className="btn btn-primary" disabled={saving || authLoading}>
              {saving ? "Posting…" : "Post thread"}
            </button>
            <p className="forums-hint">Keep it within Arleco content guidelines.</p>
          </div>
        </form>
      ) : null}

      {error ? <p className="forums-error">{error}</p> : null}

      {loading ? (
        <p className="forums-muted">Loading threads…</p>
      ) : topics.length === 0 ? (
        <div className="forums-empty">
          <p>No threads in this category yet.</p>
          <p className="forums-muted">Be the first to start one.</p>
        </div>
      ) : (
        <ul className="forums-topic-list">
          {topics.map((topic) => (
            <li key={topic.id}>
              <Link className="forums-topic-card" to={`/forums/${topic.id}`}>
                <div className="forums-topic-meta">
                  <span className="forums-topic-cat">{categoryLabel(topic.category)}</span>
                  {topic.pinned ? <span className="forums-pill">Pinned</span> : null}
                  {topic.locked ? <span className="forums-pill forums-pill--muted">Locked</span> : null}
                </div>
                <h2>{topic.title}</h2>
                <p>{topic.excerpt}</p>
                <div className="forums-topic-foot">
                  <span>{topic.author?.displayName || "Member"}</span>
                  <span>{topic.reply_count} {topic.reply_count === 1 ? "reply" : "replies"}</span>
                  <span>{formatForumWhen(topic.last_post_at)}</span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
