import { describe, expect, test } from "bun:test";
import { createStatusTimer } from "../public/ts/statusToast";

function fixture() {
  let now = 0, expired = 0;
  const jobs: Array<{ at: number; action: () => void; canceled: boolean; fired: boolean }> = [];
  const timer = createStatusTimer(() => expired++, (action, delay) => {
    const job = { at: now + delay, action, canceled: false, fired: false };
    jobs.push(job);
    return () => { job.canceled = true; };
  });
  const advance = (ms: number) => {
    now += ms;
    for (const job of jobs) if (!job.canceled && !job.fired && job.at <= now) { job.fired = true; job.action(); }
  };
  return { timer, jobs, advance, expired: () => expired };
}

describe("six-second status notes", () => {
  test("does not expire early and dismisses at six seconds", () => {
    const f = fixture();
    f.timer.restart();
    f.advance(5999); expect(f.expired()).toBe(0);
    f.advance(1); expect(f.expired()).toBe(1);
    f.advance(6000); expect(f.expired()).toBe(1);
  });
  test("replacement feedback receives a fresh six seconds", () => {
    const f = fixture();
    f.timer.restart(); f.advance(5000); f.timer.restart();
    expect(f.jobs[0]!.canceled).toBe(true);
    f.advance(5999); expect(f.expired()).toBe(0);
    f.advance(1); expect(f.expired()).toBe(1);
  });
  test("early dismissal or empty feedback cancels pending expiry", () => {
    const f = fixture();
    f.timer.restart(); f.advance(1000); f.timer.clear(); f.timer.clear();
    f.advance(6000); expect(f.expired()).toBe(0);
    f.timer.restart(); f.advance(6000); expect(f.expired()).toBe(1);
  });
  test("stale callbacks cannot dismiss a newer message or run after clearing", () => {
    const f = fixture();
    f.timer.restart(); f.timer.restart();
    f.jobs[0]!.action(); expect(f.expired()).toBe(0);
    f.timer.clear(); f.jobs[1]!.action(); expect(f.expired()).toBe(0);
  });
});
