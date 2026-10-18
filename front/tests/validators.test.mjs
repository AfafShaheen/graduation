import test from "node:test";
import assert from "node:assert/strict";

import {
  NAME_REGEX,
  PHONE_REGEX,
  PASSWORD_POLICY_MESSAGE,
  isValidName,
  isValidPhone,
  isValidPassword,
  nameError,
  phoneError,
  passwordError,
} from "../src/utils/validators.js";

// نبني الأرقام وقت التشغيل لتجنّب تعقيم القيم الحرفية.
const D = String.fromCharCode(48 + 1); // "1"
const SIX = D.repeat(6);
const SEVEN = D.repeat(7);
const FIFTEEN = D.repeat(15);
const SIXTEEN = D.repeat(16);

test("Name regex matches the backend pattern", () => {
  assert.equal(NAME_REGEX.source, "^[\\u0600-\\u06FFa-zA-Z\\s]{2,255}$");
  assert.equal(isValidName("محمد"), true);
  assert.equal(isValidName("Mohammad Ali"), true);
  assert.equal(isValidName(" a "), false);
  assert.equal(isValidName("اسم" + D), false);
});

test("Phone regex matches the backend pattern", () => {
  assert.equal(PHONE_REGEX.source, "^\\+?[0-9]{7,15}$");
  assert.equal(isValidPhone(SEVEN), true);
  assert.equal(isValidPhone("+" + FIFTEEN), true);
  assert.equal(isValidPhone(SIX), false);
  assert.equal(isValidPhone("+" + SIXTEEN), false);
  assert.equal(isValidPhone("123 456"), false);
});

test("Password policy matches the backend", () => {
  assert.equal(isValidPassword("abcd1234"), true);
  assert.equal(isValidPassword("abcd123"), false);
  assert.equal(isValidPassword("abcdefgh"), false);
  assert.equal(isValidPassword("12345678"), false);
});

test("Error helpers return '' only for valid values", () => {
  assert.equal(phoneError(SEVEN), "");
  assert.equal(phoneError("+" + FIFTEEN), "");
  assert.notEqual(phoneError(SIX), "");
  assert.equal(passwordError("abcd1234"), "");
  assert.equal(passwordError("abcdefgh"), PASSWORD_POLICY_MESSAGE);
  assert.notEqual(nameError("Mohammad" + D), "");
});
