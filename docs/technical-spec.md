# LiteGrid Parametric Technical Specification

## Design intent

LiteGrid Parametric separates shell generation from drawer generation so cabinet dimensions can be exported once and consumed repeatedly by drawer presets with different wall profiles.

## Components

### Cabinet Generator
- Computes outer shell dimensions for a flat-pack cabinet.
- Partitions large panels against printer build-volume bounds.
- Produces tab-and-slot interlock metadata.
- Derives internal waffle-grid slots snapped to nozzle extrusion units.

### Drawer Generator
- Consumes the cabinet contract schema.
- Builds drawer envelopes dynamically for each grid slot.
- Supports `solid`, `honeycomb`, and `45-degree-trusses` wall profiles.
- Uses a 45-degree overhang handle lip so the design remains support-free for FDM printing.

## DfAM rules

| Parameter | Default | Rule |
| --- | ---: | --- |
| Nozzle diameter | 0.4 mm | All parametric dimensions snap to half-nozzle extrusion increments. |
| Wall thickness | 1.2 mm | Defaults to three 0.4 mm lines. |
| Divider thickness | 1.2 mm | Matches wall thickness for repeatable waffle-grid joints. |
| Drawer clearance | 0.35 mm | Clearance is reserved on both drawer width and depth for sliding fit. |
| Handle geometry | 45° | Avoids support material on standard FDM printers. |

## Contract flow

1. Cabinet generator exports a JSON document matching `schemas/cabinet_drawer_contract.schema.json`.
2. Drawer generator reads the contract, selects a slot by row/column, and derives a matching drawer envelope.
3. CAD backends such as CadQuery or build123d can consume the generated plan dictionaries as the next implementation step.
