import test from "node:test";
import assert from "node:assert/strict";

import {
  validateShamCashAccount,
  validateReceiverName,
  validateSupportPhone,
} from "../src/utils/validators.js";

// ---- B5.2: جدول صدق مطابق لجدول A1.2 (back/tests/test_admin_settings_validation.py) ----
const ACCOUNT_ACCEPTED = ["AB12cd34", "7f3a9c1e0b"];
const ACCOUNT_REJECTED = ["AB 12", "12-34", "abc", "x".repeat(101), "حساب123"];
const RECEIVER_ACCEPTED = ["محمد أحمد", "Mohammad Ahmad", "O'Brien-Smith Jr."];
const RECEIVER_REJECTED = ["محمد 123", "A", "ن".repeat(201), "<script>"];
const PHONE_ACCEPTED = ["0933123456", "+963933123456"];
const PHONE_REJECTED = ["12345", "abc1234567", "0933-123-456", "1".repeat(16)];

test("validateShamCashAccount accepts the same values as the backend (D1)", () => {
  for (const v of ACCOUNT_ACCEPTED) assert.equal(validateShamCashAccount(v), "", v);
});

test("validateShamCashAccount rejects with the backend message", () => {
  const msg = "رقم الحساب يقبل أحرفاً وأرقاماً إنجليزية فقط (من 4 إلى 100 خانة) بدون مسافات أو رموز";
  for (const v of ACCOUNT_REJECTED) assert.equal(validateShamCashAccount(v), msg, v);
});

test("validateReceiverName accepts the same values as the backend (D2)", () => {
  for (const v of RECEIVER_ACCEPTED) assert.equal(validateReceiverName(v), "", v);
});

test("validateReceiverName rejects with the backend message", () => {
  const msg = "اسم المستفيد يقبل حروفاً عربية أو إنجليزية ومسافات فقط (من حرفين إلى 200)";
  for (const v of RECEIVER_REJECTED) assert.equal(validateReceiverName(v), msg, v);
});

test("validateSupportPhone accepts the same values as the backend (D3)", () => {
  for (const v of PHONE_ACCEPTED) assert.equal(validateSupportPhone(v), "", v);
});

test("validateSupportPhone rejects with the backend message", () => {
  const msg = "رقم الهاتف يجب أن يتكون من أرقام فقط (من 7 إلى 15 رقماً) ويمكن أن يبدأ بعلامة +";
  for (const v of PHONE_REJECTED) assert.equal(validateSupportPhone(v), msg, v);
});

test("settings validators treat null/blank as valid (absent = unchanged, blank = clear)", () => {
  assert.equal(validateShamCashAccount(null), "");
  assert.equal(validateShamCashAccount(""), "");
  assert.equal(validateReceiverName(undefined), "");
  assert.equal(validateSupportPhone("   "), "");
});

test("settings validators trim before validating", () => {
  assert.equal(validateShamCashAccount("  AB12cd34  "), "");
  assert.equal(validateReceiverName("  محمد أحمد  "), "");
  assert.equal(validateSupportPhone(" 0933123456 "), "");
});
