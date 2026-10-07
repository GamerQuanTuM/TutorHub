/** Turns a YouTube / Vimeo watch link into an embeddable URL, or null for anything else. */
export function embedUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "");
    if (host === "youtube.com" || host === "m.youtube.com") {
      const id = u.searchParams.get("v");
      return id ? `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}` : null;
    }
    if (host === "youtu.be") return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(u.pathname.slice(1))}`;
    if (host === "vimeo.com") return `https://player.vimeo.com/video/${encodeURIComponent(u.pathname.slice(1))}`;
  } catch {}
  return null;
}
