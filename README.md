# litegrid-parametric

Ultra-low-waste parametric modular organizer for FDM printing.

## Overview

`litegrid-parametric` initializes a two-stage CAD workflow for modular organizers:

1. **Cabinet Generator** computes the flat-pack cabinet shell, interlocks, build-volume-aware panel partitions, and the internal waffle-grid layout.
2. **Drawer Generator** consumes the cabinet export contract and derives matching drawers with configurable wall profiles and support-free handles.

The current repository provides Python scaffolding for CadQuery/build123d driven geometry generation, plus the shared JSON contract that keeps both generators decoupled.

## Architecture

```text
┌─────────────────────┐      JSON contract       ┌─────────────────────┐
│ Cabinet Generator   │ ───────────────────────▶ │ Drawer Generator    │
│ - shell envelope    │                          │ - slot consumption  │
│ - interlocks        │                          │ - wall profiles     │
│ - build partitions  │                          │ - 45° handle lip    │
│ - waffle-grid slots │                          │ - printable drawer  │
└─────────────────────┘                          └─────────────────────┘
```

## Repository layout

```text
src/
  cabinet_generator.py
  drawer_generator.py
  utils/nozzle_math.py
schemas/
  cabinet_drawer_contract.schema.json
docs/
  technical-spec.md
tests/
  test_generators.py
```

## Design rules (DfAM)

- Dimensions are snapped to half-nozzle extrusion increments to minimize waste and preserve print predictability.
- Default wall and divider thickness are `1.2 mm` (three 0.4 mm lines).
- Drawer clearance defaults to `0.35 mm` so drawers can slide without elephant-foot compensation hacks.
- Drawer handles use a **45-degree overhang** profile to stay support-free on standard FDM printers.
- Flat-pack shell panels are partitioned against printer build volume before CAD solids are generated.

## CLI usage

Generate a cabinet contract:

```bash
python -m src.cabinet_generator --width 126 --depth 88 --height 72
```

Generate a drawer plan from an exported contract:

```bash
python -m src.cabinet_generator --width 126 --depth 88 --height 72 > /tmp/cabinet.json
python -m src.drawer_generator /tmp/cabinet.json --row 0 --column 0 --wall-profile honeycomb
```

## Testing

Run the focused automated tests with:

```bash
python -m unittest discover -s tests -v
```
