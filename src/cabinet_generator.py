from __future__ import annotations

import argparse
import json
from dataclasses import asdict, dataclass
from math import ceil, floor

from src.utils.nozzle_math import ensure_multiple, extrusion_unit, snap_to_multiple, validate_positive


@dataclass(frozen=True)
class BuildVolume:
    x: float = 220.0
    y: float = 220.0
    z: float = 250.0

    def validate(self) -> "BuildVolume":
        validate_positive(self.x, "build_volume.x")
        validate_positive(self.y, "build_volume.y")
        validate_positive(self.z, "build_volume.z")
        return self


@dataclass(frozen=True)
class GridDefinition:
    rows: int
    columns: int
    slot_width: float
    slot_depth: float
    slot_height: float
    divider_thickness: float


@dataclass(frozen=True)
class CabinetSpec:
    width: float
    depth: float
    height: float
    wall_thickness: float = 1.2
    divider_thickness: float = 1.2
    nozzle_diameter: float = 0.4
    clearance: float = 0.35
    target_cell_width: float = 42.0
    target_cell_depth: float = 42.0
    build_volume: BuildVolume = BuildVolume()

    def validate(self) -> "CabinetSpec":
        unit = extrusion_unit(self.nozzle_diameter)
        for name in ("width", "depth", "height", "wall_thickness", "divider_thickness", "target_cell_width", "target_cell_depth"):
            ensure_multiple(getattr(self, name), unit, name)
        validate_positive(self.clearance, "clearance")
        self.build_volume.validate()
        if self.width <= 2 * self.wall_thickness or self.depth <= 2 * self.wall_thickness:
            raise ValueError("Cabinet must leave positive internal width and depth.")
        if self.height <= self.wall_thickness:
            raise ValueError("Cabinet height must exceed the base shell thickness.")
        return self

    @property
    def unit(self) -> float:
        return extrusion_unit(self.nozzle_diameter)

    @property
    def inner_width(self) -> float:
        return round(self.width - (2 * self.wall_thickness), 6)

    @property
    def inner_depth(self) -> float:
        return round(self.depth - (2 * self.wall_thickness), 6)

    @property
    def inner_height(self) -> float:
        return round(self.height - self.wall_thickness, 6)


class CabinetGenerator:
    def __init__(self, spec: CabinetSpec) -> None:
        self.spec = spec.validate()

    def build_grid(self) -> GridDefinition:
        columns = max(1, floor((self.spec.inner_width + self.spec.divider_thickness) / (self.spec.target_cell_width + self.spec.divider_thickness)))
        rows = max(1, floor((self.spec.inner_depth + self.spec.divider_thickness) / (self.spec.target_cell_depth + self.spec.divider_thickness)))
        slot_width = snap_to_multiple(
            (self.spec.inner_width - self.spec.divider_thickness * (columns - 1)) / columns,
            self.spec.unit,
            mode="floor",
        )
        slot_depth = snap_to_multiple(
            (self.spec.inner_depth - self.spec.divider_thickness * (rows - 1)) / rows,
            self.spec.unit,
            mode="floor",
        )
        slot_height = snap_to_multiple(self.spec.inner_height - self.spec.clearance, self.spec.unit, mode="floor")
        return GridDefinition(
            rows=rows,
            columns=columns,
            slot_width=slot_width,
            slot_depth=slot_depth,
            slot_height=slot_height,
            divider_thickness=self.spec.divider_thickness,
        )

    def _partition_span(self, span: float, limit: float) -> list[float]:
        count = max(1, ceil(span / limit))
        nominal = snap_to_multiple(span / count, self.spec.unit, mode="ceil")
        segments = [nominal] * count
        overshoot = round(sum(segments) - span, 6)
        index = count - 1
        while overshoot > 0 and index >= 0:
            reduction = min(overshoot, self.spec.unit)
            segments[index] = round(segments[index] - reduction, 6)
            overshoot = round(overshoot - reduction, 6)
            index -= 1
        return segments

    def flat_pack_panels(self) -> list[dict[str, object]]:
        volume = self.spec.build_volume
        return [
            {"name": "left_side", "segments": self._partition_span(self.spec.depth, volume.x), "height": self.spec.height},
            {"name": "right_side", "segments": self._partition_span(self.spec.depth, volume.x), "height": self.spec.height},
            {"name": "base", "segments": self._partition_span(self.spec.width, volume.x), "depth": self.spec.depth},
            {"name": "back", "segments": self._partition_span(self.spec.width, volume.x), "height": self.spec.height},
        ]

    def export_contract(self) -> dict[str, object]:
        grid = self.build_grid()
        drawer_entries = [
            {
                "row": row,
                "column": column,
                "width": grid.slot_width,
                "depth": grid.slot_depth,
                "height": grid.slot_height,
            }
            for row in range(grid.rows)
            for column in range(grid.columns)
        ]
        return {
            "schema_version": "1.0.0",
            "generator": "cabinet",
            "cad_backend_scaffold": ["cadquery", "build123d"],
            "cabinet": {
                "outer_dimensions": {"width": self.spec.width, "depth": self.spec.depth, "height": self.spec.height},
                "inner_dimensions": {"width": self.spec.inner_width, "depth": self.spec.inner_depth, "height": self.spec.inner_height},
                "nozzle_diameter": self.spec.nozzle_diameter,
                "extrusion_unit": self.spec.unit,
                "wall_thickness": self.spec.wall_thickness,
                "build_volume": asdict(self.spec.build_volume),
            },
            "grid": asdict(grid),
            "interlocks": {
                "style": "tab-and-slot",
                "tab_width": snap_to_multiple(self.spec.wall_thickness * 4, self.spec.unit, mode="ceil"),
                "panel_clearance": self.spec.clearance,
            },
            "drawers": {
                "clearance": self.spec.clearance,
                "wall_profile_options": ["solid", "honeycomb", "45-degree-trusses"],
                "entries": drawer_entries,
            },
            "flat_pack_panels": self.flat_pack_panels(),
        }


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Generate cabinet contract data for litegrid-parametric.")
    parser.add_argument("--width", type=float, required=True)
    parser.add_argument("--depth", type=float, required=True)
    parser.add_argument("--height", type=float, required=True)
    parser.add_argument("--wall-thickness", type=float, default=1.2)
    parser.add_argument("--divider-thickness", type=float, default=1.2)
    parser.add_argument("--nozzle-diameter", type=float, default=0.4)
    parser.add_argument("--clearance", type=float, default=0.35)
    parser.add_argument("--target-cell-width", type=float, default=42.0)
    parser.add_argument("--target-cell-depth", type=float, default=42.0)
    return parser


def main() -> int:
    args = build_parser().parse_args()
    spec = CabinetSpec(
        width=args.width,
        depth=args.depth,
        height=args.height,
        wall_thickness=args.wall_thickness,
        divider_thickness=args.divider_thickness,
        nozzle_diameter=args.nozzle_diameter,
        clearance=args.clearance,
        target_cell_width=args.target_cell_width,
        target_cell_depth=args.target_cell_depth,
    )
    print(json.dumps(CabinetGenerator(spec).export_contract(), indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
