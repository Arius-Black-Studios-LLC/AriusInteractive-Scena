import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import {
  categoryLabel,
  createForumPost,
  formatForumWhen,
  getForumTopic,
  type ForumTopicDetail,
} from "../lib/forums";
import "./ForumsPage.css";

export function ForumTopicPage() {
  const { topicId = "" } = useParams();
  const { userId, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  const [topic, setTopic] = useState<ForumTopicDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const [saving, setSaving] = useState(false);

  async function reload() {
    if (!topicId) return;
    setLoading(true);
    setError(null);
    try {
      const row = await getForumTopic(topicId);
      setTopic(row);
      if (!row) setError("Thread not found.");
    } catch (err) {
      setError((err as Error)?.message || "Could not load thread.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topicId]);

  async function onReply(e: FormEvent) {
    e.preventDefault();
    if (!userId) {
      navigate(`/forums/${topicId}?login=1`);
      return;
    }
    if (!topicId) return;
    setSaving(true);
    setError(null);
    try {
      await createForumPost({ topicId, body: reply });
      setReply("");
      await reload();
    } catch (err) {
      setError((err as Error)?.message || "Could not post reply.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <main className="forums-main container">
        <p className="forums-muted">Loading thread…</p>
      </main>
    );
  }

  if (!topic) {
    return (
      <main className="forums-main container">
        <p className="forums-error">{error || "Thread not found."}</p>
        <Link to="/forums">← Back to forums</Link>
      </main>
    );
  }

  return (
    <main className="forums-main container forums-topic-page">
      <p className="forums-crumb">
        <Link to="/forums">Forums</Link>
        <span aria-hidden="true"> / </span>
        <span>{categoryLabel(topic.category)}</span>
      </p>

      <article className="forums-op">
        <div className="forums-topic-meta">
          <span className="forums-topic-cat">{categoryLabel(topic.category)}</span>
          {topic.locked ? <span className="forums-pill forums-pill--muted">Locked</span> : null}
        </div>
        <h1>{topic.title}</h1>
        <div className="forums-post-byline">
          <strong>{topic.author?.displayName || "Member"}</strong>
          <span>{formatForumWhen(topic.created_at)}</span>
        </div>
        <div className="forums-post-body">{topic.body}</div>
      </article>

      <section className="forums-replies">
        <h2>
          {topic.reply_count} {topic.reply_count === 1 ? "reply" : "replies"}
        </h2>
        {topic.posts.length === 0 ? (
          <p className="forums-muted">No replies yet — start the conversation.</p>
        ) : (
          <ul className="forums-reply-list">
            {topic.posts.map((post) => (
              <li key={post.id} className="forums-reply">
                <div className="forums-post-byline">
                  <strong>{post.author?.displayName || "Member"}</strong>
                  <span>{formatForumWhen(post.created_at)}</span>
                </div>
                <div className="forums-post-body">{post.body}</div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {error ? <p className="forums-error">{error}</p> : null}

      {topic.locked ? (
        <p className="forums-muted">This thread is locked.</p>
      ) : (
        <form className="forums-composer forums-reply-composer" onSubmit={onReply}>
          <h2>Reply</h2>
          {!userId ? (
            <p className="forums-muted">
              <Link to={`/forums/${topicId}?login=1`}>Log in</Link> to join the thread.
            </p>
          ) : (
            <>
              <label className="forums-field">
                <span className="visually-hidden">Your reply</span>
                <textarea
                  rows={5}
                  maxLength={8000}
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  placeholder="Write a reply…"
                  required
                />
              </label>
              <button type="submit" className="btn btn-primary" disabled={saving || authLoading}>
                {saving ? "Posting…" : "Post reply"}
              </button>
            </>
          )}
        </form>
      )}
    </main>
  );
}
