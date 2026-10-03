// Production-build test server. The version switch exists only in this test process.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, extname } from "node:path";

const root = resolve("dist");
let version = "base";
const contentTypes = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
};
createServer(async (request, response) => {
  const url = new URL(request.url, "http://localhost");
  if (url.pathname === "/__test/version" && request.method === "POST") {
    version = url.searchParams.get("value") || "base";
    response.end("ok");
    return;
  }
  if (!url.pathname.startsWith("/tv/")) {
    response.writeHead(404).end();
    return;
  }
  const pathname = url.pathname.slice("/tv/".length) || "index.html";
  const file = resolve(root, pathname);
  if (!file.startsWith(root + "/")) {
    response.writeHead(403).end();
    return;
  }
  try {
    if (version === "broken" && pathname === "index.html") {
      response.writeHead(503).end("simulated incomplete deployment");
      return;
    }
    let body = await readFile(file);
    if (version !== "base" && pathname === "index.html")
      body = Buffer.from(
        body
          .toString()
          .replace("<title>TV</title>", "<title>TV updated</title>"),
      );
    if (version !== "base" && pathname === "sw.js") {
      const original = body.toString();
      const changed = original.replace(
        /"revision":"[^"]+","url":"index.html"/,
        `"revision":"test-${version}","url":"index.html"`,
      );
      if (changed === original)
        throw new Error("Missing index.html precache entry");
      body = Buffer.from(changed);
    }
    response.writeHead(200, {
      "Content-Type": contentTypes[extname(file)] || "application/octet-stream",
      "Cache-Control": "no-store",
    });
    response.end(body);
  } catch {
    response.writeHead(404).end();
  }
}).listen(4173, "127.0.0.1", () =>
  console.log("TV test server ready at http://127.0.0.1:4173/tv/"),
);
