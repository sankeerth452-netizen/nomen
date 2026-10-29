import { afterEach, describe, expect, it } from "vitest";
import { GET } from "@/app/api/health/route";

const saved = { ...process.env };
afterEach(() => { process.env = { ...saved }; });

describe("health check", () => {
  it("reports preview mode", async () => {
    process.env.PROVIDER_MODE = "mock";
    expect(await (await GET()).json()).toEqual({ status: "ok", mode: "preview", configured: true });
  });
  it("reports live mode and whether every key is set, never the keys themselves", async () => {
    Object.assign(process.env, { PROVIDER_MODE: "live", ANTHROPIC_API_KEY: "sk-secret", ANTHROPIC_MODEL: "m", DATAFORSEO_LOGIN: "l", DATAFORSEO_PASSWORD: "p" });
    const body = await (await GET()).json();
    expect(body).toEqual({ status: "ok", mode: "live", configured: true });
    expect(JSON.stringify(body)).not.toContain("sk-secret");
    process.env.DATAFORSEO_PASSWORD = " ";
    expect(await (await GET()).json()).toMatchObject({ mode: "live", configured: false });
  });
});
