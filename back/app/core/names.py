"""How names are compared and how a name typed by a graduate is cleaned.

The Affairs file can spell a name differently from the graduate ("أحمد" and "احمد", "فاطمة" and
"فاطمه", "عبد الله" and "عبدالله"). So names are MATCHED loosely (``name_key``) but what the
graduate typed is what is STORED and printed, after a light cleaning (``clean_typed_name``).
"""
import re

# Zero-width and bidirectional control marks that copy and paste brings along.
_INVISIBLE_MARKS = dict.fromkeys(
    [
        0x200B, 0x200C, 0x200D, 0x200E, 0x200F,
        0x202A, 0x202B, 0x202C, 0x202D, 0x202E,
        0x2066, 0x2067, 0x2068, 0x2069, 0xFEFF,
    ]
)
_DIACRITICS = re.compile(r"[ؗ-ًؚ-ْٰ]")
_TATWEEL = "ـ"


def clean_typed_name(text: str | None) -> str:
    """The name as it will be stored: no invisible marks, no diacritics, no tatweel, one space between words.

    The spelling itself (hamza, taa marbuta, ...) is left exactly as typed.
    """
    if not text:
        return ""
    cleaned = str(text).translate(_INVISIBLE_MARKS).replace(" ", " ")
    cleaned = _DIACRITICS.sub("", cleaned).replace(_TATWEEL, "")
    return re.sub(r"\s+", " ", cleaned).strip()


def normalize_arabic(text: str | None) -> str:
    """Unify the spellings that are the same letter to a person typing on a phone."""
    if not text:
        return ""
    text = str(text).translate(_INVISIBLE_MARKS).replace(" ", " ")
    text = _DIACRITICS.sub("", text).replace(_TATWEEL, "")
    text = re.sub(r"[أإآ]", "ا", text)
    text = text.replace("ة", "ه")
    text = text.replace("ى", "ي")
    # letters some keyboards produce: Persian yeh and keheh
    text = text.replace("ی", "ي").replace("ک", "ك")
    return re.sub(r"\s+", " ", text).strip()


def name_key(text: str | None) -> str:
    """What two names are compared by: the unified spelling without any space,
    so "عبد الله" and "عبدالله" are the same name."""
    return normalize_arabic(text).replace(" ", "")
