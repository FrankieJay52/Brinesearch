import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const workerSource = await readFile(path.join(scriptDirectory, "retire-legacy-service-worker.js"), "utf8");

function loadWorker({ clientUrls = [] } = {}) {
  const listeners = new Map();
  const deletedCaches = [];
  const navigations = [];
  const clients = clientUrls.map((url) => ({
    url,
    navigate(destination) {
      navigations.push({ url, destination });
      return Promise.resolve();
    },
  }));
  const context = {
    URL,
    Response,
    Promise,
    caches: {
      keys: async () => ["brinesearch-v16-25", "brinesearch-v17-3-31", "workbox-precache-v2-v18"],
      delete: async (name) => {
        deletedCaches.push(name);
        return true;
      },
    },
    self: {
      location: { origin: "https://brinesearch.com" },
      skipWaiting: async () => undefined,
      clients: {
        claim: async () => undefined,
        matchAll: async () => clients,
      },
      addEventListener(type, listener) {
        listeners.set(type, listener);
      },
    },
  };
  vm.runInNewContext(workerSource, context, { filename: "retire-legacy-service-worker.js" });
  return { listeners, deletedCaches, navigations };
}

test("activation removes only legacy caches and moves only legacy windows into V18", async () => {
  const worker = loadWorker({
    clientUrls: [
      "https://brinesearch.com/index.html#/settings/roads",
      "https://brinesearch.com/v18/#/control-center",
      "https://example.com/index.html",
    ],
  });
  let activation;
  worker.listeners.get("activate")({ waitUntil(promise) { activation = promise; } });
  await activation;

  assert.deepEqual(worker.deletedCaches, ["brinesearch-v16-25", "brinesearch-v17-3-31"]);
  assert.deepEqual(worker.navigations, [{
    url: "https://brinesearch.com/index.html#/settings/roads",
    destination: "https://brinesearch.com/v18/#/",
  }]);
});

test("legacy navigations redirect to V18 while V18 navigations bypass the root worker", async () => {
  const worker = loadWorker();
  let responsePromise;
  worker.listeners.get("fetch")({
    request: { method: "GET", mode: "navigate", url: "https://brinesearch.com/index.html#/auth/signin" },
    respondWith(promise) { responsePromise = promise; },
  });
  const response = await responsePromise;
  assert.equal(response.status, 302);
  assert.equal(response.headers.get("location"), "https://brinesearch.com/v18/#/");

  let intercepted = false;
  worker.listeners.get("fetch")({
    request: { method: "GET", mode: "navigate", url: "https://brinesearch.com/v18/#/control-center" },
    respondWith() { intercepted = true; },
  });
  assert.equal(intercepted, false);
});
