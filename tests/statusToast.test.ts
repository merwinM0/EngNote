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

describe("two-second pausable status notes", () => {
  test("expires after two real seconds, not after an assumed number of frames", () => {
    const f = fixture(); f.timer.restart();
    f.advance(1999); expect(f.expired()).toBe(0);
    f.advance(1); expect(f.expired()).toBe(1);
    expect(f.progress.at(-1)).toEqual({ elapsed: 2000, paused: false });
    f.advance(2000); expect(f.expired()).toBe(1);
  });
  test("hover pauses the exact remaining duration and leaving resumes it", () => {
    const f = fixture(); f.timer.restart(); f.advance(750); f.timer.pause();
    expect(f.timer.remaining).toBe(1250);
    expect(f.progress.at(-1)).toEqual({ elapsed: 750, paused: true });
    f.advance(20000); expect(f.expired()).toBe(0); expect(f.timer.remaining).toBe(1250);
    f.timer.resume(); f.advance(1249); expect(f.expired()).toBe(0);
    f.advance(1); expect(f.expired()).toBe(1);
  });
  test("repeated pause/resume does not reset the countdown or double-schedule", () => {
    const f = fixture(); f.timer.restart(); f.advance(500); f.timer.pause(); f.timer.pause();
    f.advance(1000); f.timer.resume(); f.timer.resume(); f.advance(500); f.timer.pause();
    expect(f.timer.remaining).toBe(1000); f.advance(5000); f.timer.resume(); f.advance(1000);
    expect(f.expired()).toBe(1);
  });
  test("replacement feedback receives a fresh two seconds, including after a pause", () => {
    const f = fixture(); f.timer.restart(); f.advance(1500); f.timer.pause();
    f.timer.restart(); expect(f.timer.remaining).toBe(2000);
    f.advance(1999); expect(f.expired()).toBe(0); f.advance(1); expect(f.expired()).toBe(1);
  });
  test("early dismissal cancels expiry and resume cannot resurrect it", () => {
    const f = fixture(); f.timer.restart(); f.advance(1000); f.timer.clear(); f.timer.clear(); f.timer.resume();
    f.advance(6000); expect(f.expired()).toBe(0);
    f.timer.restart(); f.advance(2000); expect(f.expired()).toBe(1);
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
