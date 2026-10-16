"""SQL utility functions, such as escaping LIKE wildcards."""


def escape_like(value: str) -> str:
    """Escape LIKE wildcards so a literal ``%`` or ``_`` matches literally."""
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
