import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "..", "src", "pages", "scanner", "ScannerLogin.jsx"), "utf8");

test("exactly one submit button with class scan-login-submit-btn (D9)", () => {
  const count = (src.match(/className="scan-login-submit-btn"/g) || []).length;
  assert.equal(count, 1, `expected exactly 1 scan-login-submit-btn, got ${count}`);
});

test("picker has no own button and its old label is gone", () => {
  assert.ok(!src.includes("دخول إلى هذا الحفل"), "the picker's own button label must be removed");
  // the select stays inside the picker block
  assert.ok(src.includes('id="scanner-event"'), "event picker select must remain");
});

test("main button label is the fixed text with loading variant", () => {
  assert.ok(src.includes("'تسجيل الدخول'"), "button label must be تسجيل الدخول");
  assert.ok(src.includes("'جاري الدخول...'"), "loading label must be جاري الدخول...");
  assert.ok(!src.includes("تسجيل الدخول وبدء المسح"), "old long label must be gone");
});

test("submit path uses the selected event when the picker is visible", () => {
  // handleSubmit branch: performLogin(selectedEventId) exists and is guarded by the picker state
  assert.ok(
    /if \(eventChoices\.length > 0 && selectedEventId\) \{\s*await performLogin\(selectedEventId\);/.test(src),
    "handleSubmit must log in with the selected event when the picker is shown"
  );
  // default path unchanged
  assert.ok(src.includes("await performLogin();"), "no-picker path must stay performLogin()");
});

test("button disabled until an event is chosen while the picker is visible", () => {
  assert.ok(
    /disabled=\{loading \|\| \(eventChoices\.length > 0 && !selectedEventId\)\}/.test(src),
    "the single button must be disabled while the picker is visible without a choice"
  );
});

test("typing username or password clears the picker and the selection", () => {
  assert.ok(src.includes("setEventChoices([])"), "input change must clear the picker choices");
  assert.ok(src.includes("setSelectedEventId('')"), "input change must clear the selected event");
});
