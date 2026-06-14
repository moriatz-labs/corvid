import { spawn } from "node:child_process";

const npm = process.platform === "win32" ? "npm.cmd" : "npm";

const processes = [
  spawn(`${npm} run dev:server`, { stdio: "inherit", shell: true }),
  spawn(`${npm} run dev:web`, { stdio: "inherit", shell: true }),
];

let shuttingDown = false;

for (const child of processes) {
  child.on("exit", (code) => {
    if (!shuttingDown && code && code !== 0) {
      shutdown(code);
    }
  });
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

function shutdown(code) {
  shuttingDown = true;
  for (const child of processes) {
    if (!child.killed) {
      child.kill();
    }
  }
  process.exit(code);
}
