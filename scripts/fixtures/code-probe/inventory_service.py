# Deterministic probe fixture: a realistic small Python service module.
# Exercises: imports, module constants, two classes with methods, free functions,
# decorated definition, nested control flow, doc comments.
import os
import json
from dataclasses import dataclass
from typing import Optional


DEFAULT_WAREHOUSE = "main"
MAX_BATCH = 500


@dataclass
class InventoryItem:
    """One stock-keeping unit tracked by the service."""

    sku: str
    quantity: int
    warehouse: str = DEFAULT_WAREHOUSE

    def is_depleted(self) -> bool:
        return self.quantity <= 0

    def merged_with(self, other: "InventoryItem") -> "InventoryItem":
        if other.sku != self.sku:
            raise ValueError(f"sku mismatch: {other.sku} != {self.sku}")
        return InventoryItem(self.sku, self.quantity + other.quantity, self.warehouse)


class InventoryLedger:
    """Append-only ledger of stock movements with a derived balance view."""

    def __init__(self, root: str) -> None:
        self.root = root
        self._entries: list[dict] = []

    def append(self, item: InventoryItem, delta: int) -> None:
        if abs(delta) > MAX_BATCH:
            raise ValueError("delta exceeds batch cap")
        self._entries.append({"sku": item.sku, "delta": delta})

    def balance(self, sku: str) -> int:
        total = 0
        for entry in self._entries:
            if entry["sku"] == sku:
                total += entry["delta"]
        return total

    def dump(self) -> str:
        return json.dumps(self._entries, sort_keys=True)


def load_ledger(path: str) -> Optional[InventoryLedger]:
    if not os.path.exists(path):
        return None
    ledger = InventoryLedger(os.path.dirname(path))
    with open(path, "r", encoding="utf-8") as fh:
        for line in fh:
            record = json.loads(line)
            ledger.append(InventoryItem(record["sku"], 0), record["delta"])
    return ledger


def summarize(ledger: InventoryLedger, skus: list[str]) -> dict:
    return {sku: ledger.balance(sku) for sku in skus}
