// GET /api/photo/<bucket-key…> — serve a run photo.
//
// Storage reads are authenticated, and an <img> tag cannot send an
// Authorization header, so the image is proxied here rather than linked
// directly. Photos in this app are public by design, so no caller check — but
// the key is confined to the photos bucket, and nothing about the request is
// taken as a path.

import { service } from "@/lib/server";

export async function GET(_req: Request, ctx: { params: Promise<{ key: string[] }> }) {
  const { key } = await ctx.params;
  // Next has already decoded each segment; reject anything that tries to climb
  // out of the bucket.
  if (!key?.length || key.some((s) => !s || s === "." || s === "..")) {
    return new Response("not found", { status: 404 });
  }

  const res = await service("GET", `/api/storage/photos/${key.join("/")}`);
  if (!res.ok) {
    return new Response("not found", { status: res.status === 404 ? 404 : 502 });
  }

  return new Response(res.body, {
    headers: {
      "Content-Type": res.headers.get("content-type") ?? "application/octet-stream",
      // The key carries a timestamp, so a stored object never changes.
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
