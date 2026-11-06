/** Resolve the listening port without starting the server, so deployment defaults stay testable. */
export function resolvePort(env: Readonly<Record<string, string | undefined>> = process.env): number {
  const production = env.NODE_ENV === "production";
  const rawPort = env.PORT?.trim() || (production ? "80" : "3000");
  const port = /^\d+$/.test(rawPort) ? Number(rawPort) : NaN;
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("PORT must be an integer between 1 and 65535.");
  return port;
}

/** Port 80 is implicit in browser links; other ports stay explicit. */
export const httpUrl = (host: string, port: number) => `http://${host}${port === 80 ? "" : `:${port}`}`;
