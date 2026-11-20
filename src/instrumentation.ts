// Runs once when the server starts. Range work (reading photos, naming pieces) lives in this process, so after a
// restart or a deploy it waits for a nudge: give it one, instead of waiting for someone to open a range.
// The import sits inside the Node.js check (Next.js's documented pattern) so it's left out of the edge build, where
// the image library the worker uses can't load.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./instrumentation-node");
  }
}
