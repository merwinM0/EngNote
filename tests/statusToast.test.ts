import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { createStatusTimer } from "../public/ts/statusTimer";

function fixture() {
  let now = 0, expired = 0;
  const progress: Array<{ elapsed: number; paused: boolean }> = [];
  const jobs: Array<{ at: number; action: () => void; canceled: boolean; fired: boolean }> = [];
  const timer = createStatusTimer(() => expired++, (action, delay) => {
    const job = { at: now + delay, action, canceled: false, fired: false };
    jobs.push(job); return () => { job.canceled = true; };
  }, () => now, (elapsed, paused) => progress.push({ elapsed, paused }));
  const advance = (ms: number) => {
    now += ms;
    for (const job of jobs) if (!job.canceled && !job.fired && job.at <= now) { job.fired = true; job.action(); }
  };
  return { timer, jobs, progress, advance, expired: () => expired };
}

describe("1.7-second pausable status notes", () => {
  test("expires after 1700 real milliseconds, not after an assumed number of frames", () => {
    const f = fixture(); f.timer.restart();
    f.advance(1699); expect(f.expired()).toBe(0);
    f.advance(1); expect(f.expired()).toBe(1);
    expect(f.progress.at(-1)).toEqual({ elapsed: 1700, paused: false });
    f.advance(2000); expect(f.expired()).toBe(1);
  });
  test("hover pauses the exact remaining duration and leaving resumes it", () => {
    const f = fixture(); f.timer.restart(); f.advance(750); f.timer.pause();
    expect(f.timer.remaining).toBe(950);
    expect(f.progress.at(-1)).toEqual({ elapsed: 750, paused: true });
    f.advance(20000); expect(f.expired()).toBe(0); expect(f.timer.remaining).toBe(950);
    f.timer.resume(); f.advance(949); expect(f.expired()).toBe(0);
    f.advance(1); expect(f.expired()).toBe(1);
  });
  test("repeated pause/resume does not reset the countdown or double-schedule", () => {
    const f = fixture(); f.timer.restart(); f.advance(500); f.timer.pause(); f.timer.pause();
    f.advance(1000); f.timer.resume(); f.timer.resume(); f.advance(500); f.timer.pause();
    expect(f.timer.remaining).toBe(700); f.advance(5000); f.timer.resume(); f.advance(699);
    expect(f.expired()).toBe(0); f.advance(1);
    expect(f.expired()).toBe(1);
  });
  test("replacement feedback receives a fresh 1700ms, including after a pause", () => {
    const f = fixture(); f.timer.restart(); f.advance(1500); f.timer.pause();
    f.timer.restart(); expect(f.timer.remaining).toBe(1700);
    f.advance(1699); expect(f.expired()).toBe(0); f.advance(1); expect(f.expired()).toBe(1);
  });
  test("early dismissal cancels expiry and resume cannot resurrect it", () => {
    const f = fixture(); f.timer.restart(); f.advance(1000); f.timer.clear(); f.timer.clear(); f.timer.resume();
    f.advance(6000); expect(f.expired()).toBe(0);
    f.timer.restart(); f.advance(2000); expect(f.expired()).toBe(1);
  });
  test("uses a smaller, lower note without a separate close glyph or reserved glyph space", () => {
    const css = readFileSync("public/css/statusToast.css", "utf8");
    expect(css).toContain("width: min(320px, calc(100% - 32px))");
    expect(css).toContain("--status-top: max(48px, calc(env(safe-area-inset-top) + 24px))");
    expect(css).toContain("--status-top: max(40px, calc(env(safe-area-inset-top) + 24px))");
    expect(css).toContain("max-height: calc(var(--status-max-height) - 20px)");
    expect(css).toContain(".status-copy { display: block; font-size: 12px; line-height: 1.7;");
    expect(css).not.toContain(".status-close");
    expect(css.match(/\.status-heading\s*\{([^}]+)\}/)?.[1]).not.toContain("padding-right");
    const source = readFileSync("public/ts/statusToast.ts", "utf8");
    expect(source).toContain('bar.addEventListener("click", dismissStatus)');
  });
  test("uses a lower tape strip only for messages, preserving the shared progress style", () => {
    const css = readFileSync("public/css/statusToast.css", "utf8");
    expect(css).toContain(".status-progress .tape-progress-track { width: 100%; height: 28px; }");
    expect(css).toContain(".status-progress .tape-progress-strip { top: 5px; height: 18px; transform: rotate(-1deg); }");
    expect(css).toContain(".status-progress .tape-progress-track::after { top: 4px; height: 19px; }");
    const shared = readFileSync("public/css/progress.css", "utf8");
    expect(shared).toContain("height: 40px");
    expect(shared).toContain("height: 28px");
  });
  test("stale callbacks cannot hide a newer, paused or dismissed message", () => {
    const f = fixture(); f.timer.restart(); f.timer.restart();
    f.jobs[0]!.action(); expect(f.expired()).toBe(0);
    f.timer.pause(); f.jobs[1]!.action(); expect(f.expired()).toBe(0);
    f.timer.clear(); f.jobs[1]!.action(); expect(f.expired()).toBe(0);
  });
});
