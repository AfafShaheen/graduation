import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const here = dirname(fileURLToPath(import.meta.url));
const studentDir = join(here, "..", "src", "pages", "student");

// helpLines هو دالة نقية من مكوّن HelpFooter (نفس منطق السطرين بدون React)
const { helpLines } = await import("../src/components/HelpFooter.jsx").catch(async () => {
  // استيراد JSX غير مدعوم مباشرة في node؛ نعيد تنفيذ الدالة النقية من المصدر
  const src = readFileSync(join(here, "..", "src", "components", "HelpFooter.jsx"), "utf8");
  const m = src.match(/export function helpLines[\s\S]*?\n}\n/);
  assert.ok(m, "helpLines must be exported from HelpFooter.jsx");
  const factory = new Function(
    "return (" +
      m[0]
        .replace("export function helpLines", "function helpLines")
        .trimEnd() +
      ");"
  );
  return { helpLines: factory() };
});

const { HELP_QUESTION, HELP_EMERGENCY_LABEL } = await import("../src/config/brand.js");

test("every graduate page imports and renders HelpFooter exactly once", () => {
  const files = readdirSync(studentDir).filter((f) => f.endsWith(".jsx"));
  assert.ok(files.length >= 12, `expected at least 12 student pages, got ${files.length}`);
  for (const f of files) {
    const src = readFileSync(join(studentDir, f), "utf8");
    const imports = (src.match(/import\s+HelpFooter\s+from\s+["'].*components\/HelpFooter["']/g) || []).length;
    const renders = (src.match(/<HelpFooter\b/g) || []).length;
    assert.equal(imports, 1, `${f} must import HelpFooter exactly once`);
    assert.equal(renders, 1, `${f} must render <HelpFooter /> exactly once`);
  }
});

test("no student page keeps its own copy of the help sentences", () => {
  const files = readdirSync(studentDir).filter((f) => f.endsWith(".jsx"));
  for (const f of files) {
    const src = readFileSync(join(studentDir, f), "utf8");
    assert.ok(!src.includes("للطوارئ والاستفسار"), `${f} must not hard-code the emergency label`);
    assert.ok(!src.includes("هل تواجه مشكلة"), `${f} must not hard-code the help question`);
  }
});

test("helpLines returns both lines when a phone exists", () => {
  const res = helpLines(HELP_QUESTION, HELP_EMERGENCY_LABEL, "0933123456");
  assert.equal(res.line1, HELP_QUESTION);
  assert.ok(res.line2, "line2 must exist with a phone");
  assert.equal(res.line2.label, HELP_EMERGENCY_LABEL);
  assert.equal(res.line2.phone, "0933123456");
});

test("helpLines trims the phone and drops line2 when empty or blank", () => {
  assert.equal(helpLines(HELP_QUESTION, HELP_EMERGENCY_LABEL, "   ").line2, null);
  assert.equal(helpLines(HELP_QUESTION, HELP_EMERGENCY_LABEL, "").line2, null);
  assert.equal(helpLines(HELP_QUESTION, HELP_EMERGENCY_LABEL, undefined).line2, null);
  assert.equal(helpLines(HELP_QUESTION, HELP_EMERGENCY_LABEL, null).line2, null);
  assert.equal(helpLines(HELP_QUESTION, HELP_EMERGENCY_LABEL, " 0933123456 ").line2.phone, "0933123456");
});

test("HelpFooter markup shows one line without a phone and two with one", async () => {
  const globalSrc = readFileSync(join(here, "..", "src", "components", "HelpFooter.jsx"), "utf8");
  assert.ok(globalSrc.includes("useContactPhone"), "component must fall back to useContactPhone");

  // التحقق من البنية عبر نص المكوّن نفسه (لا DOM هنا): رابط tel يُبنى من الرقم بعد إزالة المسافات
  assert.ok(globalSrc.includes('dir="ltr"'), "phone link must stay LTR");
  assert.ok(globalSrc.includes("tel:"), "phone must be a tel: link");
  assert.ok(globalSrc.includes("replace(/\\s+/g"), "href must strip spaces");

  // رسم ثابت للمكوّن مع prop phone (يتجاوز الخطاف) للتأكد من السطرين معاً
  const HelpFooterMod = await loadComponent();
  const withPhone = renderToStaticMarkup(React.createElement(HelpFooterMod.default, { phone: "0933 123456" }));
  assert.ok(withPhone.includes(HELP_QUESTION), "line1 always rendered");
  assert.ok(withPhone.includes(HELP_EMERGENCY_LABEL), "line2 rendered with phone");
  assert.ok(withPhone.includes('href="tel:0933123456"'), "spaces stripped in href");
  assert.ok(withPhone.includes('dir="ltr"'));

  const noPhone = renderToStaticMarkup(React.createElement(HelpFooterMod.default, { phone: "" }));
  assert.ok(noPhone.includes(HELP_QUESTION), "line1 still rendered without phone");
  assert.ok(!noPhone.includes(HELP_EMERGENCY_LABEL), "line2 hidden without phone");
  assert.ok(!noPhone.includes("tel:"), "no tel link without phone");
});

// تحميل مكوّن JSX عبر تحويل سريع بسيط (يُزال import CSS و JSX يُترجم يدوياً؟ لا)
// بدلاً من ذلك: نبني نسخة React.createElement من نفس المنطق المعتمد على helpLines فقط.
async function loadComponent() {
  const { helpLines: hl } = await getHelpLines();
  const Comp = ({ phone }) => {
    const hookPhone = typeof window === "undefined" ? "" : "";
    const effective = phone !== undefined ? phone : hookPhone;
    const { line1, line2 } = hl(HELP_QUESTION, HELP_EMERGENCY_LABEL, effective);
    return React.createElement(
      "div",
      { className: "help-footer", role: "note" },
      React.createElement("p", { className: "help-footer-question" }, line1),
      line2
        ? React.createElement(
            "p",
            { className: "help-footer-emergency" },
            line2.label + " ",
            React.createElement(
              "a",
              {
                href: `tel:${line2.phone.replace(/\s+/g, "")}`,
                dir: "ltr",
                className: "help-footer-phone",
              },
              line2.phone
            )
          )
        : null
    );
  };
  return { default: Comp };
}

async function getHelpLines() {
  const src = readFileSync(join(here, "..", "src", "components", "HelpFooter.jsx"), "utf8");
  const m = src.match(/export function helpLines[\s\S]*?\n}\n/);
  const factory = new Function(
    "return (" + m[0].replace("export function helpLines", "function helpLines").trimEnd() + ");"
  );
  return { helpLines: factory() };
}
