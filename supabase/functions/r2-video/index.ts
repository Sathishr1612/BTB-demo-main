// Lesson videos stored in Cloudflare R2 (no egress fees). The R2 keys live only in server secrets.
// POST { action: "play",   path }  -> anyone; returns a 2 h signed GET link only if can_stream_video_path() allows the caller
//                                     (free course, preview lesson, enrolled student or admin - the same rule as Supabase Storage).
// POST { action: "upload", path }  -> admins only; returns a 1 h signed PUT link for a new file.
// POST { action: "delete", path }  -> admins only; deletes the file.
// Paths are stored in videos.video_storage_path as "r2:{course_id}/{video_id}/{random}.mp4".
// Secrets: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET.
import { AwsClient } from "npm:aws4fetch@1.0.20";
import { corsHeaders, env, json, userClient } from "../_shared/common.ts";

const PATH_RE = /^r2:[0-9a-f-]{36}\/[0-9a-f-]{36}\/[A-Za-z0-9_-]+\.(mp4|webm)$/i;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const b = await req.json().catch(() => ({}));
    const path = String(b.path ?? "");
    if (!PATH_RE.test(path)) return json({ error: "Invalid video path." }, 400);

    const account = env("R2_ACCOUNT_ID"), bucket = env("R2_BUCKET");
    if (!account || !bucket || !env("R2_ACCESS_KEY_ID") || !env("R2_SECRET_ACCESS_KEY")) throw new Error("R2 secrets are not configured");
    const r2 = new AwsClient({ accessKeyId: env("R2_ACCESS_KEY_ID"), secretAccessKey: env("R2_SECRET_ACCESS_KEY"), service: "s3", region: "auto" });
    const url = `https://${account}.r2.cloudflarestorage.com/${bucket}/${path.slice(3)}`;
    const presign = async (method: string, seconds: number) =>
      (await r2.sign(new Request(url + "?X-Amz-Expires=" + seconds, { method }), { aws: { signQuery: true } })).url;

    // Access is decided by the database functions, called as the requesting user (or anon).
    const db = userClient(req);

    if (b.action === "play") {
      const { data: allowed, error } = await db.rpc("can_stream_video_path", { p_path: path });
      if (error) throw error;
      if (!allowed) return json({ error: "You do not have access to this lesson." }, 403);
      return json({ url: await presign("GET", 7200) });
    }

    const { data: admin, error: aErr } = await db.rpc("is_admin");
    if (aErr) throw aErr;
    if (!admin) return json({ error: "Admins only." }, 403);

    if (b.action === "upload") return json({ url: await presign("PUT", 3600) });
    if (b.action === "delete") {
      const res = await r2.fetch(url, { method: "DELETE" });
      if (!res.ok && res.status !== 404) throw new Error("R2 delete failed: " + res.status);
      return json({ deleted: true });
    }
    return json({ error: "Unknown action." }, 400);
  } catch (e) {
    console.error("r2-video", e);
    return json({ error: "The video service is not available right now. Please try again." }, 500);
  }
});
