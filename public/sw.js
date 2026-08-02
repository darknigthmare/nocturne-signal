"use strict";

const CACHE_PREFIX = "nocturne-signal-";
const CACHE_NAME = `${CACHE_PREFIX}shell-v1`;
const SHELL_URLS = ["/", "/manifest.webmanifest"];
const MAX_CACHE_ENTRIES = 80;

function isSameOriginGet(request) {
  if (request.method !== "GET") return false;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return false;
  if (request.headers.has("range") || request.headers.has("authorization")) return false;

  const excludedPaths = [
    "/api",
    "/signin-with-chatgpt",
    "/signout-with-chatgpt",
    "/callback",
    "/_next/webpack-hmr",
    "/_next/image",
  ];
  if (
    excludedPaths.some(
      (path) => url.pathname === path || url.pathname.startsWith(`${path}/`),
    )
  ) {
    return false;
  }

  const accept = request.headers.get("accept") || "";
  if (request.headers.get("rsc") === "1" || accept.includes("text/x-component")) {
    return false;
  }

  return url.pathname !== "/sw.js";
}

function isPublicResponse(response) {
  if (!response || !response.ok) return false;
  if (response.type !== "basic" && response.type !== "default") return false;

  const cacheControl = response.headers.get("cache-control") || "";
  const vary = response.headers.get("vary") || "";
  return !/(?:^|,)\s*(?:private|no-store)\b/i.test(cacheControl) && vary.trim() !== "*";
}

function cacheKey(request) {
  if (request.mode !== "navigate") return request;
  const url = new URL(request.url);
  return `${url.origin}${url.pathname}`;
}

async function trimCache(cache) {
  const keys = await cache.keys();
  let excess = keys.length - MAX_CACHE_ENTRIES;
  if (excess <= 0) return;

  for (const key of keys) {
    const pathname = new URL(key.url).pathname;
    if (SHELL_URLS.includes(pathname)) continue;
    await cache.delete(key);
    excess -= 1;
    if (excess <= 0) return;
  }
}

async function storeResponse(cache, key, response) {
  if (!isPublicResponse(response)) return;
  await cache.put(key, response);
  await trimCache(cache);
}

async function precacheShell() {
  const cache = await caches.open(CACHE_NAME);

  await Promise.all(
    SHELL_URLS.map(async (url) => {
      try {
        const response = await fetch(new Request(url, { cache: "reload" }));
        await storeResponse(cache, url, response.clone());
      } catch {
        // A failed optional preload must not prevent the worker from installing.
      }
    }),
  );
}

async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  const key = cacheKey(request);

  try {
    const response = await fetch(request);
    await storeResponse(cache, key, response.clone());
    return response;
  } catch (networkError) {
    const cached = await cache.match(key);
    if (cached) return cached;

    if (request.mode === "navigate") {
      const shell = await cache.match("/");
      if (shell) return shell;
    }

    throw networkError;
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(precacheShell().then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(
          names
            .filter((name) => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME)
            .map((name) => caches.delete(name)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  if (!isSameOriginGet(event.request)) return;
  event.respondWith(networkFirst(event.request));
});
