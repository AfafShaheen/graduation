import test from "node:test";
import assert from "node:assert/strict";
import { cameraErrorText } from "../src/utils/cameraError.js";

test("a plain string rejection is kept as it is", () => {
  assert.equal(cameraErrorText("NotAllowedError: Permission denied"), "NotAllowedError: Permission denied");
});

test("an Error exposes both its name and message", () => {
  const err = new Error("Requested device not found");
  err.name = "NotFoundError";
  assert.equal(cameraErrorText(err), "NotFoundError Requested device not found");
});

test("missing or empty errors give an empty string", () => {
  assert.equal(cameraErrorText(undefined), "");
  assert.equal(cameraErrorText({}), "");
});
