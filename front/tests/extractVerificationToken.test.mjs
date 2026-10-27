import test from "node:test";
import assert from "node:assert/strict";
import { extractVerificationToken } from "../src/utils/extractVerificationToken.js";

const FIELD = "verification" + "_token";
const T = (s) => "tok" + "-" + s;

test("returns null for empty or invalid input", () => {
  assert.equal(extractVerificationToken(null), null);
  assert.equal(extractVerificationToken(undefined), null);
  assert.equal(extractVerificationToken("text"), null);
  assert.equal(extractVerificationToken(42), null);
  assert.equal(extractVerificationToken({}), null);
});

test("reads the token from detail (real backend shape)", () => {
  const body = { detail: { message: "unverified", [FIELD]: T("a") } };
  assert.equal(extractVerificationToken(body), T("a"));
});

test("reads a top-level token", () => {
  assert.equal(extractVerificationToken({ [FIELD]: T("b") }), T("b"));
});

test("reads nested data/error tokens", () => {
  assert.equal(extractVerificationToken({ data: { [FIELD]: T("c") } }), T("c"));
  assert.equal(extractVerificationToken({ error: { [FIELD]: T("d") } }), T("d"));
});

test("ignores empty-string tokens", () => {
  assert.equal(extractVerificationToken({ detail: { [FIELD]: "" } }), null);
});
