import { spawn } from "node:child_process";
import { mkdtemp, rm, mkdir, open, cp, readFile } from "node:fs/promises";
import { tmpdir, userInfo } from "node:os";
import { join, resolve } from "node:path";
import { randomBytes } from "node:crypto";
import { createServer } from "node:net";
import { startWorker } from "./worker-server.mjs";
const root = resolve(import.meta.dirname, "../.."),
  scratch = await mkdtemp(join(tmpdir(), "linen-ui-")),
  out = resolve(
    process.env.LINEN_TEST_OUTPUT ||
      join(root, ".wrangler", "ui-evidence", String(Date.now())),
  );
await mkdir(out, { recursive: true });
const log = await open(join(out, "worker.log"), "a");
let worker;
async function command(bin, args) {
  await new Promise((yes, no) => {
    const child = spawn(bin, args, {
      cwd: root,
      stdio: ["ignore", log.fd, log.fd],
    });
    child.on("error", no);
    child.on("exit", (code) =>
      code === 0
        ? yes()
        : no(
            Error(
              `${bin} ${args.join(" ")} exited ${code}; inspect ${out}/worker.log`,
            ),
          ),
    );
  });
}
async function port() {
  const socket = createServer();
  await new Promise((r) => socket.listen(Number(process.env.LINEN_TEST_PORT || 0), "127.0.0.1", r));
  const value = socket.address().port;
  await new Promise((r) => socket.close(r));
  return value;
}
try {
  let url = process.env.LINEN_TEST_URL;
  if (!url) {
    if (!process.env.LINEN_TEST_BUILT) await command("pnpm", ["run", "build:app"]);
    await cp(join(root, "dist"), join(scratch, "dist"), { recursive: true });
    const value = await port();
    url = `http://127.0.0.1:${value}`;
    await command(process.execPath, [
      "node_modules/wrangler/bin/wrangler.js",
      "d1",
      "migrations",
      "apply",
      "DB",
      "--local",
      "--persist-to",
      join(scratch, "state"),
      "--config",
      "wrangler.jsonc",
    ]);
    worker = await startWorker({
      config: join(scratch, "dist/server/wrangler.json"),
      port: value,
      persistTo: join(scratch, "state"),
      vars: { AUTH_ORIGIN: url, APP_ORIGIN: url, AUTH_LOCAL: "true", MAIL_PROVIDER: "development",
        SESSION_SECRET: randomBytes(32).toString("hex"), ENCRYPTION_KEY: randomBytes(32).toString("base64") },
      logFd: log.fd,
    });
    const response = await fetch(url + "/api/v1/setup");
    if (!response.ok) throw Error("Isolated worker did not become ready");
    if (!(await response.json()).required) throw Error("Isolated database is not empty");
  }
  await new Promise((yes, no) => {
    const child = spawn(process.execPath, [process.argv[2] || "tests/ui/browser.mjs"], {
      cwd: root,
      stdio: "inherit",
      // The browser driver uses the real account home even when RER runs in an isolated home.
      env: { ...process.env, HOME: userInfo().homedir, LINEN_TEST_URL: url, LINEN_TEST_OUTPUT: out },
    });
    child.on("error", no);
    child.on("exit", async (code) => {
      if (code === 0) return yes();
      // Include the server exception beside the failing assertion. Do not retry a write
      // or replace a transport failure with an application permission response.
      try {
        const output = await readFile(join(out, "worker.log"), "utf8");
        no(Error(`Browser acceptance exited ${code}; Worker output:\n${output.split("\n").slice(-80).join("\n")}`));
      } catch (error) { no(error); }
    });
  });
  console.log(`UI evidence: ${out}`);
} finally {
  await worker?.dispose();
  await log.close();
  await rm(join(scratch, "state"), { recursive: true, force: true });
  await rm(join(scratch, "dist"), { recursive: true, force: true });
}
