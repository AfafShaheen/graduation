import React from "react";
import useContactPhone from "../hooks/useContactPhone";

export default function ContactPhoneLink({ className = "", style }) {
  const contactPhone = useContactPhone();
  if (!contactPhone) return null;

  return (
    <p className={className} style={style}>
      للطوارئ والاستفسار:{" "}
      <a
        href={`tel:${contactPhone.replace(/\s+/g, "")}`}
        dir="ltr"
        style={{ color: "inherit", textDecoration: "underline", fontWeight: 600 }}
      >
        {contactPhone}
      </a>
    </p>
  );
}
