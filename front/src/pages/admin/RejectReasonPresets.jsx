// أزرار أسباب الرفض الجاهزة (القرار D1): اختيار زر يملأ مربع النص في النافذة الأب،
// والنص يبقى قابلاً للتعديل بعد الاختيار. الأسباب نفسها في ملف واحد:
// src/config/rejectReasons.js (REJECT_REASON_PRESETS).
import { REJECT_REASON_PRESETS } from '../../config/rejectReasons';

export default function RejectReasonPresets({ onPick }) {
  return (
    <div className="pay-req-presets" role="group" aria-label="أسباب رفض جاهزة">
      {REJECT_REASON_PRESETS.map((text) => (
        <button
          key={text}
          type="button"
          className="pay-req-preset-btn"
          aria-label={`تعبئة سبب الرفض: ${text}`}
          onClick={() => onPick(text)}
        >
          {text}
        </button>
      ))}
    </div>
  );
}
