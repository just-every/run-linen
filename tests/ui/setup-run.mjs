import { spawn } from "node:child_process";
import { mkdtemp, rm, mkdir, open, cp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { randomBytes } from "node:crypto";
import { createServer } from "node:net";
const root = resolve(import.meta.dirname, "../.."),
  scratch = await mkdtemp(join(tmpdir(), "linen-setup-ui-")),
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
  if (process.env.LINEN_TEST_URL) throw Error("Setup fixtures require the runner-owned isolated worker, never an existing preview URL");
  let url;
  if (!url) {
    await command("pnpm", ["build"]);
    await cp(join(root, "dist"), join(scratch, "dist"), { recursive: true });
    const value = await port();
    url = `http://127.0.0.1:${value}`;
    await writeFile(
      join(scratch, "dist/server/.dev.vars"),
      `AUTH_ORIGIN=${url}\nAPP_ORIGIN=${url}\nAUTH_LOCAL=true\nMAIL_PROVIDER=development\nSESSION_SECRET=${randomBytes(32).toString("hex")}\nENCRYPTION_KEY=${randomBytes(32).toString("base64")}\n`,
      { mode: 0o600 },
    );
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
    worker = spawn(
      process.execPath,
      [
        "node_modules/wrangler/bin/wrangler.js",
        "dev",
        "--config",
        join(scratch, "dist/server/wrangler.json"),
        "--local",
        "--port",
        String(value),
        "--inspector-port",
        "0",
        "--persist-to",
        join(scratch, "state"),
      ],
      { cwd: root, stdio: ["ignore", log.fd, log.fd], detached: true },
    );
    let ready = false;
    for (let i = 0; i < 120; i++) {
      if (worker.exitCode !== null)
        throw Error("Isolated worker exited before becoming ready");
      try {
        const r = await fetch(url + "/api/v1/setup");
        if (r.ok) {
          const data = await r.json();
          if (!data.required) throw Error("Isolated database is not empty");
          ready = true;
          break;
        }
      } catch {}
      await new Promise((r) => setTimeout(r, 250));
    }
    if (!ready) throw Error("Isolated worker did not become ready");
  }
  await new Promise((yes, no) => {
    const child = spawn(process.execPath, [process.argv[2] || "tests/ui/setup-browser.mjs"], {
      cwd: root,
      stdio: "inherit",
      env: { ...process.env, LINEN_TEST_URL: url, LINEN_TEST_OUTPUT: out, LINEN_SETUP_STATE: join(scratch, "state") },
    });
    child.on("error", no);
    child.on("exit", (code) =>
      code === 0 ? yes() : no(Error(`Browser acceptance exited ${code}`)),
    );
  });
  console.log(`UI evidence: ${out}`);
} finally {
  if (worker && worker.exitCode === null) {
    process.kill(-worker.pid, "SIGTERM");
    await new Promise((r) => {
      worker.once("exit", r);
      setTimeout(r, 3000);
    });
  }
  await log.close();
  await rm(join(scratch, "state"), { recursive: true, force: true });
  await rm(join(scratch, "dist"), { recursive: true, force: true });
}
