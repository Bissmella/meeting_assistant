from functools import cache


@cache
def autoselect_model() -> str:
    """Just returns a dummy model for now."""
    return "gpt-4"