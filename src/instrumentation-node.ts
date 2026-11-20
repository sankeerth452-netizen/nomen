// Server start, Node.js only (see instrumentation.ts): restart range work a few seconds after the server is up.
setTimeout(() => {
  import("./lib/batch/worker")
    .then(({ kick }) => kick())
    .catch((e) => console.error("range work didn't restart", e instanceof Error ? e.message : e));
}, 5_000);
export {};
