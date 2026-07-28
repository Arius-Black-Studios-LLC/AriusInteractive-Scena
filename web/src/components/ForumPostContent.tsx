type Props = {
  body: string;
  imageUrls?: string[] | null;
};

export function ForumPostContent({ body, imageUrls }: Props) {
  const urls = (imageUrls || []).filter(Boolean);
  const hasBody = Boolean(body?.trim());

  return (
    <div className="forums-post-content">
      {hasBody ? <div className="forums-post-body">{body}</div> : null}
      {urls.length > 0 ? (
        <ul className={"forums-post-images" + (hasBody ? " has-body" : "")}>
          {urls.map((url) => (
            <li key={url}>
              <a href={url} target="_blank" rel="noopener noreferrer">
                <img src={url} alt="" loading="lazy" />
              </a>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
