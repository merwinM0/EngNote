import { describe, expect, test } from "bun:test";
import { httpUrl, resolvePort } from "../backend/config";

describe("runtime listening defaults", () => {
  test("keeps local development on 3000 by default", () => {
    expect(resolvePort({})).toBe(3000);
    expect(resolvePort({ NODE_ENV: "development" })).toBe(3000);
    expect(resolvePort({ PORT: "  " })).toBe(3000);
  });
  test("uses port 80 for production links unless configured otherwise", () => {
    expect(resolvePort({ NODE_ENV: "production" })).toBe(80);
    expect(resolvePort({ NODE_ENV: "production", PORT: "" })).toBe(80);
    expect(resolvePort({ NODE_ENV: "production", PORT: "8080" })).toBe(8080);
    expect(resolvePort({ PORT: "3000" })).toBe(3000);
  });
  test("rejects invalid ports instead of silently falling back", () => {
    for (const PORT of ["0", "65536", "-1", "abc", "30.5"]) expect(() => resolvePort({ PORT })).toThrow("PORT");
  });
  test("omits the default web port from displayed links", () => {
    expect(httpUrl("localhost", 3000)).toBe("http://localhost:3000");
    expect(httpUrl("example.com", 80)).toBe("http://example.com");
  });
});
