import React from "react";
import useContactPhone from "../hooks/useContactPhone";
import { HELP_QUESTION, HELP_EMERGENCY_LABEL } from "../config/brand";
import "../style/HelpFooter.css";

/**
 * HelpFooter (D8) — كتلة المساعدة التي تظهر مرة واحدة في أعلى تذييل كل صفحة خريج.
 * السطر الأول: HELP_QUESTION دائماً.
 * السطر الثاني: HELP_EMERGENCY_LABEL + رابط tel عند وجود رقم دعم؛ يُحذف إن لم يوجد رقم.
 * prop اختياري phone (للاختبار)؛ افتراضياً من useContactPhone.
 */
export function helpLines(question, label, phone) {
  const trimmed = typeof phone === "string" ? phone.trim() : "";
  return {
    line1: question,
    line2: trimmed ? { label, phone: trimmed } : null,
  };
}

export default function HelpFooter({ phone }) {
  const hookPhone = useContactPhone();
  const effectivePhone = phone !== undefined ? phone : hookPhone;
  const { line1, line2 } = helpLines(HELP_QUESTION, HELP_EMERGENCY_LABEL, effectivePhone);

  return (
    <div className="help-footer" role="note">
      <p className="help-footer-question">{line1}</p>
      {line2 && (
        <p className="help-footer-emergency">
          {line2.label}{" "}
          <a
            href={`tel:${line2.phone.replace(/\s+/g, "")}`}
            dir="ltr"
            className="help-footer-phone"
          >
            {line2.phone}
          </a>
        </p>
      )}
    </div>
  );
}
