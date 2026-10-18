import fs from "node:fs";
import path from "node:path";
import { Writable } from "node:stream";
import pino, { type Logger } from "pino";

export interface LogBuffer {
  /** Most recent structured log lines, oldest first. */
  lines(): string[];
}

/** Keeps the last N log lines in memory so the desktop app can show diagnostics. */
class RingStream extends Writable {
  private buf: string[] = [];
  constructor(private readonly max: number) {
    super();
  }
  override _write(chunk: Buffer | string, _enc: BufferEncoding, cb: (e?: Error | null) => void): void {
    for (const line of chunk.toString().split("\n")) {
      if (!line) continue;
      this.buf.push(line);
      if (this.buf.length > this.max) this.buf.shift();
    }
    cb();
  }
  lines(): string[] {
    return [...this.buf];
  }
}

export interface LoggerBundle {
  logger: Logger;
  buffer: LogBuffer;
  /** Flushes pending writes and closes the log file. */
  close(): Promise<void>;
}

export function createLogger(opts: { dataDir: string; level?: string; toStdout?: boolean }): LoggerBundle {
  const logDir = path.join(opts.dataDir, "logs");
  fs.mkdirSync(logDir, { recursive: true });
  const ring = new RingStream(500);
  const file = pino.destination({ dest: path.join(logDir, "open-efb.log"), sync: false, mkdir: true });
  const streams: pino.StreamEntry[] = [
    { stream: file },
    { stream: ring },
  ];
  if (opts.toStdout ?? true) streams.push({ stream: process.stdout });
  const logger = pino(
    {
      level: opts.level ?? "info",
      base: { app: "open-efb" },
      // Never write credentials into logs.
      redact: ["req.headers.authorization", "req.headers.cookie", "pin", "*.pin", "*.token"],
    },
    pino.multistream(streams),
  );
  const close = () =>
    new Promise<void>((resolve) => {
      file.once("close", () => resolve());
      file.end();
    });
  return { logger, buffer: ring, close };
}
