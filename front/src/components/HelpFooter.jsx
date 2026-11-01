import React from "react";
import useContactPhone from "../hooks/useContactPhone";
import { HELP_QUESTION, HELP_EMERGENCY_LABEL } from "../config/brand";
import { helpLines, whatsappHref } from "./helpFooterLogic";
import "../style/HelpFooter.css";

/**
 * HelpFooter (D8) — كتلة المساعدة التي تظهر مرة واحدة في أعلى تذييل كل صفحة خريج.
 * السطر الأول: HELP_QUESTION دائماً.
 * السطر الثاني: HELP_EMERGENCY_LABEL + رابط واتساب عند وجود رقم دعم؛ يُحذف إن لم يوجد رقم.
 * prop اختياري phone (للاختبار)؛ افتراضياً من useContactPhone.
 */
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
            href={whatsappHref(line2.phone)}
            dir="ltr"
            className="help-footer-phone"
            target="_blank"
            rel="noopener noreferrer"
          >
            <span className="whatsapp-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" focusable="false">
                <path d="M12 2a9.9 9.9 0 0 0-8.55 14.9L2 22l5.25-1.38A10 10 0 1 0 12 2Zm0 18a8 8 0 0 1-4.1-1.13l-.3-.18-3.12.82.84-3.04-.2-.31A8 8 0 1 1 12 20Zm4.38-5.98c-.24-.12-1.42-.7-1.64-.78-.22-.08-.38-.12-.54.12-.16.24-.62.78-.76.94-.14.16-.28.18-.52.06-.24-.12-1.01-.37-1.92-1.18-.71-.63-1.19-1.4-1.33-1.64-.14-.24-.02-.37.1-.49.1-.1.24-.28.36-.42.12-.14.16-.24.24-.4.08-.16.04-.3-.02-.42-.06-.12-.54-1.3-.74-1.78-.2-.47-.4-.4-.54-.4h-.46c-.16 0-.42.06-.64.3-.22.24-.84.82-.84 2s.86 2.32.98 2.48c.12.16 1.68 2.56 4.07 3.59.57.25 1.01.4 1.36.52.57.18 1.09.16 1.5.1.46-.07 1.42-.58 1.62-1.14.2-.56.2-1.04.14-1.14-.06-.1-.22-.16-.46-.28Z" />
              </svg>
            </span>
            {line2.phone}
          </a>
        </p>
      )}
    </div>
  );
}
