import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
const mime = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".woff2": "font/woff2",
  ".txt": "text/plain",
};
/** A bounded, subpath preview owned by the validation process. */
export async function preview() {
  const root = resolve("dist");
  const server = createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(
        new URL(request.url ?? "/", "http://localhost").pathname,
      );
      if (!pathname.startsWith("/preview/")) {
        response.writeHead(404).end();
        return;
      }
      const path = resolve(
        root,
        pathname.slice("/preview/".length) || "index.html",
      );
      if (!path.startsWith(root + sep)) {
        response.writeHead(403).end();
        return;
      }
      const bytes = await readFile(path);
      response.writeHead(200, {
        "Content-Type": mime[extname(path)] ?? "application/octet-stream",
      });
      response.end(bytes);
    } catch {
      response.writeHead(404).end();
    }
  });
  await new Promise((done) => server.listen(0, "127.0.0.1", done));
  return {
    url: `http://127.0.0.1:${server.address().port}/preview/`,
    close: () => new Promise((done) => server.close(done)),
  };
}
export const executablePath = process.argv
  .find((arg) => arg.startsWith("--chromium="))
  ?.slice("--chromium=".length);
