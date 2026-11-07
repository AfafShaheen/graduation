"""Digits typed on an Arabic keyboard (٠-٩ and ۰-۹) turned into 0-9."""

_TO_ASCII = str.maketrans("٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹", "01234567890123456789")


def ascii_digits(value):
    """Return ``value`` with Arabic-Indic digits replaced; anything that is not text is returned as is."""
    return value.translate(_TO_ASCII) if isinstance(value, str) else value
