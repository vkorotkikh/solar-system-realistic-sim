"""Optional v1 Kuiper activation identity, echoed alongside state snapshots.

Legacy commands omit subscription_id and retain their untagged wire format.
The client owns the identity; a producer counter alone cannot identify an
activation whose earlier frame is still pending in the transport.
"""

import re
from collections.abc import Mapping
from typing import Any


def subscription_id_from_command(command: Mapping[str, Any]) -> str | None:
    if "subscription_id" not in command:
        return None
    value = command["subscription_id"]
    if not isinstance(value, str) or re.fullmatch(r"[A-Za-z0-9_-]{1,64}", value) is None:
        raise ValueError("`subscription_id` must be 1-64 ASCII letters, digits, underscores or hyphens")
    return value
