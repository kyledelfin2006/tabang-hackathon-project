/*
 * Provisions partner API clients.
 *
 *   npm run api-clients -- create --name "DOST Signal" --scopes signals:write,incidents:read
 *   npm run api-clients -- list
 *   npm run api-clients -- revoke --id <client id>
 *
 * `create` prints the key once. Only its SHA-256 hash is stored, so a lost key
 * cannot be recovered; revoke it and create another. Needs DATABASE_URL in the
 * environment or .env.
 */
import { parseArgs } from "node:util";
import { generateApiKey } from "../server/auth.mjs";
import { createPostgresStore } from "../server/store.mjs";
import { closePool } from "../server/db.mjs";

const SCOPES = new Set(["incidents:read", "signals:write"]);

function fail(message) {
  console.error(message);
  process.exit(1);
}

const [command, ...rest] = process.argv.slice(2);
const { values } = parseArgs({
  args: rest,
  options: {
    name: { type: "string" },
    scopes: { type: "string" },
    id: { type: "string" },
  },
});

if (!process.env.DATABASE_URL) {
  fail("Set DATABASE_URL first.");
}

const store = createPostgresStore();

try {
  if (command === "create") {
    const scopes = (values.scopes ?? "").split(",").map((scope) => scope.trim()).filter(Boolean);

    if (!values.name || scopes.length === 0 || !scopes.every((scope) => SCOPES.has(scope))) {
      fail(`Usage: create --name <name> --scopes <${[...SCOPES].join(",")}>`);
    }

    const { id, key, keyHash } = generateApiKey();

    await store.createApiClient({
      id,
      name: values.name,
      contactEmail: "partner@example.com",
      keyHash,
      scopes,
    });
    console.log(`Created client ${id} (${values.name}) with ${scopes.join(", ")}.`);
    console.log("Key, shown once. Give it to the partner over a secure channel:");
    console.log(key);
  } else if (command === "list") {
    for (const client of await store.listApiClients()) {
      console.log(`${client.id}  ${client.status.padEnd(7)}  ${client.scopes.join(",")}  ${client.name}`);
    }
  } else if (command === "revoke") {
    if (!values.id) {
      fail("Usage: revoke --id <client id>");
    }

    if (!(await store.revokeApiClient(values.id))) {
      fail(`No client ${values.id}.`);
    }

    console.log(`Revoked ${values.id}. Its key stops working on the next request.`);
  } else {
    fail("Usage: api-clients <create|list|revoke> [options]");
  }
} finally {
  await closePool();
}
