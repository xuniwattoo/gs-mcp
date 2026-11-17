// Vercel Functions entry (web-standard handlers). vercel.json rewrites /mcp and / to this function.
import { handleRequest } from "../src/http.js";

const handle = (req: Request) => {
  const url = new URL(req.url);
  const orig = url.searchParams.get("__path");
  if (orig !== null) { url.pathname = orig || "/"; url.searchParams.delete("__path"); }
  return handleRequest(new Request(url, req), process.env);
};
export const GET = handle;
export const POST = handle;
export const DELETE = handle;
export const OPTIONS = handle;
