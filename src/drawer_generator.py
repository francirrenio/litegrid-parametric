from __future__ import annotations

import argparse
import json
from dataclasses import dataclass
from pathlib import Path

from src.utils.nozzle_math import ensure_multiple, extrusion_unit, snap_to_multiple, validate_positive

SUPPORTED_WALL_PROFILES = {"solid", "honeycomb", "45-degree-trusses"}


@dataclass(frozen=True)
class DrawerSpec:
    slot_width: float
    slot_depth: float
    slot_height: float
    wall_thickness: float = 1.2
    floor_thickness: float = 1.2
    nozzle_diameter: float = 0.4
    clearance: float = 0.35
    wall_profile: str = "solid"

    def validate(self) -> "DrawerSpec":
        unit = extrusion_unit(self.nozzle_diameter)
        for name in ("slot_width", "slot_depth", "slot_height", "wall_thickness", "floor_thickness"):
            ensure_multiple(getattr(self, name), unit, name)
        validate_positive(self.clearance, "clearance")
        if self.wall_profile not in SUPPORTED_WALL_PROFILES:
            raise ValueError(f"wall_profile must be one of {sorted(SUPPORTED_WALL_PROFILES)}")
        outer_width = self.slot_width - (2 * self.clearance)
        outer_depth = self.slot_depth - (2 * self.clearance)
        if outer_width <= 2 * self.wall_thickness or outer_depth <= 2 * self.wall_thickness:
            raise ValueError("Slot is too small for the requested drawer wall thickness and clearance.")
        if self.slot_height <= self.floor_thickness:
            raise ValueError("slot_height must exceed floor_thickness.")
        return self


class DrawerGenerator:
    def __init__(self, spec: DrawerSpec) -> None:
        self.spec = spec.validate()

    @property
    def outer_width(self) -> float:
        return snap_to_multiple(self.spec.slot_width - (2 * self.spec.clearance), self.spec.nozzle_diameter / 2, mode="floor")

    @property
    def outer_depth(self) -> float:
        return snap_to_multiple(self.spec.slot_depth - (2 * self.spec.clearance), self.spec.nozzle_diameter / 2, mode="floor")

    @property
    def outer_height(self) -> float:
        return snap_to_multiple(self.spec.slot_height - self.spec.clearance, self.spec.nozzle_diameter / 2, mode="floor")

    def generate_plan(self) -> dict[str, object]:
        return {
            "generator": "drawer",
            "cad_backend_scaffold": ["cadquery", "build123d"],
            "wall_profile": self.spec.wall_profile,
            "outer_dimensions": {
                "width": self.outer_width,
                "depth": self.outer_depth,
                "height": self.outer_height,
            },
            "inner_dimensions": {
                "width": round(self.outer_width - (2 * self.spec.wall_thickness), 6),
                "depth": round(self.outer_depth - (2 * self.spec.wall_thickness), 6),
                "height": round(self.outer_height - self.spec.floor_thickness, 6),
            },
            "handle": {
                "style": "45-degree overhang lip",
                "projection": snap_to_multiple(self.spec.wall_thickness * 4, self.spec.nozzle_diameter / 2, mode="ceil"),
                "support_free": True,
            },
        }

    @classmethod
    def from_cabinet_contract(cls, contract: dict[str, object], *, row: int = 0, column: int = 0, wall_profile: str = "solid") -> "DrawerGenerator":
        entries = contract["drawers"]["entries"]
        match = next((entry for entry in entries if entry["row"] == row and entry["column"] == column), None)
        if match is None:
            raise ValueError(f"No drawer slot found at row={row}, column={column}")
        cabinet = contract["cabinet"]
        return cls(
            DrawerSpec(
                slot_width=match["width"],
                slot_depth=match["depth"],
                slot_height=match["height"],
                wall_thickness=cabinet["wall_thickness"],
                floor_thickness=cabinet["wall_thickness"],
                nozzle_diameter=cabinet["nozzle_diameter"],
                clearance=contract["drawers"]["clearance"],
                wall_profile=wall_profile,
            )
        )


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Generate drawer data from a cabinet contract.")
    parser.add_argument("contract", type=Path)
    parser.add_argument("--row", type=int, default=0)
    parser.add_argument("--column", type=int, default=0)
    parser.add_argument("--wall-profile", default="solid", choices=sorted(SUPPORTED_WALL_PROFILES))
    return parser


def main() -> int:
    args = build_parser().parse_args()
    contract = json.loads(args.contract.read_text())
    generator = DrawerGenerator.from_cabinet_contract(
        contract,
        row=args.row,
        column=args.column,
        wall_profile=args.wall_profile,
    )
    print(json.dumps(generator.generate_plan(), indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
