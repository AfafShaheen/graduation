"""The short manual code printed under every QR code: two letters and seven digits.

It lets a volunteer admit a person whose QR image will not scan. Graduates and companions use
different letter sets, so the first letter already tells which kind of ticket it is. The letters
I, L, O and Q are left out because they look like digits.

The code is drawn with ``secrets`` (never predictable); 100 or 144 letter pairs times 10 million
digit blocks make a blind guess very unlikely, and the scan endpoint also limits failed attempts.
"""
import re
import secrets

GRADUATE_LETTERS = "ABCDEFGHJK"
COMPANION_LETTERS = "MNPRSTUVWXYZ"
DIGITS = 7

_SHAPE = re.compile(r"^[A-Z]{2}[0-9]{7}$")
# Arabic-Indic and Eastern Arabic-Indic digits, as a phone's Arabic keyboard types them.
_DIGIT_MAP = {ord(c): str(i) for i, c in enumerate("٠١٢٣٤٥٦٧٨٩")}
_DIGIT_MAP.update({ord(c): str(i) for i, c in enumerate("۰۱۲۳۴۵۶۷۸۹")})


def random_short_code(is_graduate: bool) -> str:
    letters = GRADUATE_LETTERS if is_graduate else COMPANION_LETTERS
    pair = "".join(secrets.choice(letters) for _ in range(2))
    return f"{pair}{secrets.randbelow(10 ** DIGITS):0{DIGITS}d}"


def normalize_short_code(raw: str) -> str | None:
    """Upper-case, Arabic digits turned into 0-9, spaces and hyphens removed.

    Returns ``None`` when the text is not shaped like a short code.
    """
    text = str(raw or "").translate(_DIGIT_MAP)
    text = re.sub(r"[\s\-_]", "", text).upper()
    return text if _SHAPE.match(text) else None
