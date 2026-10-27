import { test } from "node:test";
import assert from "node:assert/strict";
import { createTicketRequest } from "../src/utils/ticketRequest.js";

test("collapses concurrent calls for the same token into one request", async () => {
  let calls = 0;
  const request = createTicketRequest(async (token) => {
    calls += 1;
    return { token };
  });

  const first = request.fetch("abc");
  const second = request.fetch("abc");
  const [a, b] = await Promise.all([first, second]);

  assert.equal(calls, 1);
  assert.deepEqual(a, { token: "abc" });
  assert.deepEqual(b, { token: "abc" });
});

test("allows a fresh request once the in-flight one settles", async () => {
  let calls = 0;
  const request = createTicketRequest(async () => {
    calls += 1;
    return calls;
  });

  await request.fetch("abc");
  await request.fetch("abc");

  assert.equal(calls, 2);
});

test("force bypasses an in-flight request", async () => {
  let calls = 0;
  const request = createTicketRequest(async () => {
    calls += 1;
    return calls;
  });

  const first = request.fetch("abc");
  const forced = request.fetch("abc", { force: true });
  await Promise.all([first, forced]);

  assert.equal(calls, 2);
});

test("keeps separate requests per token and ignores empty tokens", async () => {
  const seen = [];
  const request = createTicketRequest(async (token) => {
    seen.push(token);
    return token;
  });

  const empty = await request.fetch("");
  const a = request.fetch("a");
  const b = request.fetch("b");
  await Promise.all([a, b]);

  assert.equal(empty, null);
  assert.deepEqual(seen, ["a", "b"]);
});
