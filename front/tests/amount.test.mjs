import test from "node:test";
import assert from "node:assert/strict";
import { normalizeDigits, parseAmount, formatAmount } from "../src/utils/amount.js";

test("normalizeDigits converts Arabic-Indic and Persian digits", () => {
  assert.equal(normalizeDigits("٥٠٠"), "500");
  assert.equal(normalizeDigits("۱۲۳"), "123");
});

test("parseAmount reads a Decimal string without scaling by 100", () => {
  assert.equal(parseAmount("100000.00"), 100000);
  assert.equal(parseAmount("100000"), 100000);
  assert.equal(parseAmount("250000.75"), 250000.75);
});

test("parseAmount tolerates commas, spaces and Arabic digits", () => {
  assert.equal(parseAmount("100,000"), 100000);
  assert.equal(parseAmount("١٠٠٠٠٠.٠٠"), 100000);
});

test("parseAmount returns 0 for invalid input", () => {
  assert.equal(parseAmount(""), 0);
  assert.equal(parseAmount(null), 0);
  assert.equal(parseAmount(undefined), 0);
  assert.equal(parseAmount("abc"), 0);
});

test("formatAmount preserves value and drops trailing decimals", () => {
  assert.equal(formatAmount("100000.00"), "100000");
  assert.equal(formatAmount("100000"), "100000");
  assert.equal(formatAmount("250000.75"), "250000.75");
  assert.equal(formatAmount(0), "");
});
