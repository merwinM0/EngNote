export const STATUS_DURATION = 2000;
type Schedule = (action: () => void, delay: number) => () => void;
const scheduleTimeout: Schedule = (action, delay) => {
  const timer = setTimeout(action, delay);
  return () => clearTimeout(timer);
};

/** Measure actual visible time, not tick counts; stale callbacks cannot expire a replacement. */
export function createStatusTimer(onExpire: () => void, schedule: Schedule = scheduleTimeout,
  now: () => number = () => performance.now(), onProgress: (elapsed: number, paused: boolean) => void = () => {}) {
  let cancel: (() => void) | undefined, revision = 0;
  let remaining = STATUS_DURATION, last = 0, active = false, paused = false;
  const stop = () => { revision++; cancel?.(); cancel = undefined; };
  const report = () => onProgress(STATUS_DURATION - remaining, paused);
  const settle = () => { remaining = Math.max(0, remaining - Math.max(0, now() - last)); last = now(); };
  function arm() {
    const current = revision;
    cancel = schedule(() => {
      if (current !== revision || !active || paused) return;
      settle(); report();
      if (remaining <= 0) { active = false; stop(); onExpire(); }
      else arm();
    }, Math.min(50, remaining));
  }
  return {
    get remaining() { return active && !paused ? Math.max(0, remaining - Math.max(0, now() - last)) : remaining; },
    clear() { stop(); active = false; paused = false; },
    restart() { stop(); active = true; paused = false; remaining = STATUS_DURATION; last = now(); report(); arm(); },
    pause() {
      if (!active || paused) return;
      settle(); stop(); paused = true; report();
      if (remaining <= 0) { active = false; onExpire(); }
    },
    resume() {
      if (!active || !paused) return;
      paused = false; last = now(); report(); arm();
    },
  };
}
