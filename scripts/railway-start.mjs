import { spawn } from "node:child_process";

const role = process.env.FLOW_SERVICE_ROLE;
const commands = {
  web: ["node", ["server.js"]],
  payments: ["node", ["scripts/run-payment-worker.ts"]],
};

if (!role || !Object.hasOwn(commands, role)) {
  console.error(JSON.stringify({ event: "invalid_service_role", allowed: Object.keys(commands) }));
  process.exit(78);
}

const [command, args] = commands[role];
const child = spawn(command, args, { stdio: "inherit", env: process.env });
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => child.kill(signal));
}
child.once("error", (error) => {
  console.error(JSON.stringify({ event: "service_start_failed", role, error: error.message }));
  process.exit(1);
});
child.once("exit", (code, signal) => {
  process.exitCode = code ?? (signal ? 1 : 0);
});
