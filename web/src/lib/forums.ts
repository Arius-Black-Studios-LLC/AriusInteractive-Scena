import { filesToDataUrls, uploadForumImages } from "./forumImages";
import { loadLegacyScripts } from "../legacy/loadLegacy";

export const FORUM_CATEGORIES = [
  { id: "all", label: "All" },
  { id: "general", label: "General" },
  { id: "craft", label: "Craft" },
  { id: "jams", label: "Jams" },
  { id: "marketplace", label: "Marketplace" },
  { id: "feedback", label: "Feedback" },
  { id: "help", label: "Help" },
] as const;

export type ForumCategoryId = (typeof FORUM_CATEGORIES)[number]["id"];

export type ForumAuthor = {
  displayName?: string;
  avatarUrl?: string | null;
  id?: string;
};

export type ForumTopicListItem = {
  id: string;
  slug: string;
  title: string;
  category: string;
  excerpt: string;
  author: ForumAuthor;
  user_id: string;
  reply_count: number;
  last_post_at: string;
  created_at: string;
  pinned?: boolean;
  locked?: boolean;
};

export type ForumPost = {
  id: string;
  topic_id: string;
  user_id: string;
  parent_id?: string | null;
  body: string;
  image_urls?: string[];
  author: ForumAuthor;
  created_at: string;
};

export type ForumTopicDetail = {
  id: string;
  slug: string;
  title: string;
  category: string;
  body: string;
  image_urls?: string[];
  author: ForumAuthor;
  user_id: string;
  reply_count: number;
  last_post_at: string;
  created_at: string;
  pinned?: boolean;
  locked?: boolean;
  posts: ForumPost[];
};

const LOCAL_TOPICS = "arleco_forum_topics";
const LOCAL_POSTS = "arleco_forum_posts";
const LOCAL_TOPIC_IMAGES = "arleco_forum_topic_images";
const LOCAL_POST_IMAGES = "arleco_forum_post_images";

type SbClient = {
  rpc: (
    name: string,
    args?: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message?: string } | null }>;
};

function readLocalTopics(): ForumTopicListItem[] {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_TOPICS) || "[]");
  } catch {
    return [];
  }
}

function writeLocalTopics(rows: ForumTopicListItem[]) {
  try {
    localStorage.setItem(LOCAL_TOPICS, JSON.stringify(rows));
  } catch {
    /* quota */
  }
}

function readLocalPosts(): ForumPost[] {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_POSTS) || "[]");
  } catch {
    return [];
  }
}

function writeLocalPosts(rows: ForumPost[]) {
  try {
    localStorage.setItem(LOCAL_POSTS, JSON.stringify(rows));
  } catch {
    /* quota */
  }
}

function slugify(title: string): string {
  const base = title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return `${base || "topic"}-${Math.random().toString(36).slice(2, 10)}`;
}

async function getClient(): Promise<SbClient | null> {
  await loadLegacyScripts(["scena-auth.js", "scena-profile.js"]);
  const auth = window.ScenaAuth;
  if (!auth?.isConfigured?.() || !auth.getClient) return null;
  return auth.getClient() as SbClient;
}

async function authorFromProfile(): Promise<ForumAuthor> {
  await loadLegacyScripts(["scena-auth.js", "scena-profile.js"]);
  const profile = window.ScenaProfile;
  const auth = window.ScenaAuth;
  const session = (auth?.getSession ? await auth.getSession() : null) as {
    user?: { id?: string; email?: string };
  } | null;
  const userId = session?.user?.id;
  if (profile?.get && userId) {
    try {
      const row = await profile.get(userId, session as never);
      if (row && profile.authorSnapshot) {
        return profile.authorSnapshot(row) as ForumAuthor;
      }
    } catch {
      /* fall through */
    }
  }
  const email = session?.user?.email || "";
  return {
    id: userId,
    displayName: email.split("@")[0] || "Member",
  };
}

export function categoryLabel(id?: string): string {
  const row = FORUM_CATEGORIES.find((c) => c.id === id);
  return row?.label || "General";
}

export function formatForumWhen(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const diff = Date.now() - d.getTime();
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export async function listForumTopics(opts?: {
  category?: string;
  limit?: number;
}): Promise<ForumTopicListItem[]> {
  const category = opts?.category && opts.category !== "all" ? opts.category : null;
  const limit = opts?.limit ?? 40;
  const sb = await getClient();
  if (sb) {
    const res = await sb.rpc("list_forum_topics", {
      p_category: category,
      p_limit: limit,
      p_offset: 0,
    });
    if (!res.error && Array.isArray(res.data)) {
      return res.data as ForumTopicListItem[];
    }
  }
  let rows = readLocalTopics();
  if (category) rows = rows.filter((t) => t.category === category);
  rows.sort((a, b) => {
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;
    return String(b.last_post_at).localeCompare(String(a.last_post_at));
  });
  return rows.slice(0, limit);
}

export async function getForumTopic(topicId: string): Promise<ForumTopicDetail | null> {
  const sb = await getClient();
  if (sb) {
    const res = await sb.rpc("get_forum_topic", { p_topic_id: topicId });
    if (!res.error && res.data) return res.data as ForumTopicDetail;
    if (!res.error && res.data === null) return null;
  }
  const topic = readLocalTopics().find((t) => t.id === topicId);
  if (!topic) return null;
  const posts = readLocalPosts()
    .filter((p) => p.topic_id === topicId)
    .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
  return {
    id: topic.id,
    slug: topic.slug,
    title: topic.title,
    category: topic.category,
    body: readLocalTopicBody(topic.id) || topic.excerpt,
    image_urls: readLocalTopicImages(topic.id),
    author: topic.author,
    user_id: topic.user_id,
    reply_count: topic.reply_count,
    last_post_at: topic.last_post_at,
    created_at: topic.created_at,
    pinned: topic.pinned,
    locked: topic.locked,
    posts: posts.map((post) => ({
      ...post,
      image_urls: readLocalPostImages(post.id),
    })),
  };
}

function readLocalTopicBody(id: string): string {
  try {
    const map = JSON.parse(localStorage.getItem("arleco_forum_topic_bodies") || "{}");
    return map[id] || "";
  } catch {
    return "";
  }
}

function writeLocalTopicBody(id: string, body: string) {
  try {
    const map = JSON.parse(localStorage.getItem("arleco_forum_topic_bodies") || "{}");
    map[id] = body;
    localStorage.setItem("arleco_forum_topic_bodies", JSON.stringify(map));
  } catch {
    /* quota */
  }
}

function readLocalTopicImages(id: string): string[] {
  try {
    const map = JSON.parse(localStorage.getItem(LOCAL_TOPIC_IMAGES) || "{}");
    return Array.isArray(map[id]) ? map[id] : [];
  } catch {
    return [];
  }
}

function writeLocalTopicImages(id: string, urls: string[]) {
  try {
    const map = JSON.parse(localStorage.getItem(LOCAL_TOPIC_IMAGES) || "{}");
    map[id] = urls;
    localStorage.setItem(LOCAL_TOPIC_IMAGES, JSON.stringify(map));
  } catch {
    /* quota */
  }
}

function readLocalPostImages(id: string): string[] {
  try {
    const map = JSON.parse(localStorage.getItem(LOCAL_POST_IMAGES) || "{}");
    return Array.isArray(map[id]) ? map[id] : [];
  } catch {
    return [];
  }
}

function writeLocalPostImages(id: string, urls: string[]) {
  try {
    const map = JSON.parse(localStorage.getItem(LOCAL_POST_IMAGES) || "{}");
    map[id] = urls;
    localStorage.setItem(LOCAL_POST_IMAGES, JSON.stringify(map));
  } catch {
    /* quota */
  }
}

async function resolveImageUrls(
  files: File[] | undefined,
  contextKey: string,
  useCloud: boolean,
): Promise<string[]> {
  if (!files?.length) return [];
  if (useCloud) {
    return uploadForumImages(files, contextKey);
  }
  return filesToDataUrls(files);
}

export async function createForumTopic(input: {
  title: string;
  body: string;
  category: string;
  imageFiles?: File[];
}): Promise<{ id: string; slug: string }> {
  const title = input.title.trim();
  const body = input.body.trim();
  const category = input.category || "general";
  if (title.length < 3) throw new Error("Title needs at least 3 characters.");
  if (!body && !input.imageFiles?.length) throw new Error("Write an opening post or attach a photo.");

  const author = await authorFromProfile();
  const sb = await getClient();
  const draftKey = `draft-${crypto.randomUUID()}`;
  const imageUrls = await resolveImageUrls(input.imageFiles, draftKey, Boolean(sb));

  if (sb) {
    const res = await sb.rpc("create_forum_topic", {
      p_title: title,
      p_body: body,
      p_category: category,
      p_author: author,
      p_image_urls: imageUrls,
    });
    if (res.error) throw new Error(res.error.message || "Could not create thread.");
    const data = res.data as { id: string; slug: string };
    return { id: data.id, slug: data.slug };
  }

  const auth = window.ScenaAuth;
  const session = auth?.getSession ? await auth.getSession() : null;
  const userId = session?.user?.id;
  if (!userId) throw new Error("Sign in to start a thread.");

  const id = crypto.randomUUID();
  const slug = slugify(title);
  const now = new Date().toISOString();
  const row: ForumTopicListItem = {
    id,
    slug,
    title,
    category,
    excerpt: body.slice(0, 280),
    author,
    user_id: userId,
    reply_count: 0,
    last_post_at: now,
    created_at: now,
  };
  writeLocalTopics([row, ...readLocalTopics()]);
  writeLocalTopicBody(id, body);
  if (imageUrls.length) writeLocalTopicImages(id, imageUrls);
  return { id, slug };
}

export async function createForumPost(input: {
  topicId: string;
  body: string;
  parentId?: string | null;
  imageFiles?: File[];
}): Promise<string> {
  const body = input.body.trim();
  if (!body && !input.imageFiles?.length) throw new Error("Reply is empty.");
  const author = await authorFromProfile();
  const sb = await getClient();
  const imageUrls = await resolveImageUrls(
    input.imageFiles,
    input.topicId,
    Boolean(sb),
  );

  if (sb) {
    const res = await sb.rpc("create_forum_post", {
      p_topic_id: input.topicId,
      p_body: body,
      p_parent_id: input.parentId || null,
      p_author: author,
      p_image_urls: imageUrls,
    });
    if (res.error) throw new Error(res.error.message || "Could not post reply.");
    return String(res.data);
  }

  const auth = window.ScenaAuth;
  const session = auth?.getSession ? await auth.getSession() : null;
  const userId = session?.user?.id;
  if (!userId) throw new Error("Sign in to reply.");

  const topics = readLocalTopics();
  const topic = topics.find((t) => t.id === input.topicId);
  if (!topic) throw new Error("Thread not found.");
  if (topic.locked) throw new Error("This thread is locked.");

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const post: ForumPost = {
    id,
    topic_id: input.topicId,
    user_id: userId,
    parent_id: input.parentId || null,
    body,
    image_urls: imageUrls,
    author,
    created_at: now,
  };
  writeLocalPosts([...readLocalPosts(), post]);
  if (imageUrls.length) writeLocalPostImages(id, imageUrls);
  topic.reply_count = (topic.reply_count || 0) + 1;
  topic.last_post_at = now;
  writeLocalTopics(topics);
  return id;
}
