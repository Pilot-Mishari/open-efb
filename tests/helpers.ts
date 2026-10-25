import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";

export function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "open-efb-test-"));
}

export interface Res {
  status: number;
  body: any;
  headers: http.IncomingHttpHeaders;
}

/** Raw HTTP so tests can set Host / Origin headers freely. */
export function request(port: number, method: string, urlPath: string, opts: { headers?: Record<string, string>; body?: unknown; raw?: string } = {}): Promise<Res> {
  return new Promise((resolve, reject) => {
    const payload = opts.raw ?? (opts.body === undefined ? undefined : JSON.stringify(opts.body));
    const req = http.request(
      { host: "127.0.0.1", port, method, path: urlPath, headers: { ...(payload ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) } : {}), ...opts.headers } },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => {
          let body: unknown = data;
          try {
            body = JSON.parse(data);
          } catch {
            /* not JSON */
          }
          resolve({ status: res.statusCode ?? 0, body, headers: res.headers });
        });
      },
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}
