from __future__ import annotations

from math import isclose


def extrusion_unit(nozzle_diameter: float) -> float:
    """Return the minimum design increment for extrusion-aligned geometry."""
    validate_positive(nozzle_diameter, "nozzle_diameter")
    return nozzle_diameter / 2.0


def validate_positive(value: float, name: str) -> float:
    if value <= 0:
        raise ValueError(f"{name} must be positive, got {value!r}")
    return value


def is_multiple(value: float, step: float, *, tolerance: float = 1e-9) -> bool:
    validate_positive(step, "step")
    quotient = value / step
    return isclose(quotient, round(quotient), abs_tol=tolerance)


def snap_to_multiple(value: float, step: float, *, mode: str = "nearest") -> float:
    validate_positive(step, "step")
    if mode not in {"nearest", "floor", "ceil"}:
        raise ValueError(f"Unsupported snap mode: {mode}")

    quotient = value / step
    if mode == "floor":
        snapped = int(quotient)
        if snapped > quotient:
            snapped -= 1
    elif mode == "ceil":
        snapped = int(quotient)
        if snapped < quotient:
            snapped += 1
    else:
        snapped = round(quotient)
    return round(snapped * step, 6)


def ensure_multiple(value: float, step: float, name: str) -> float:
    if not is_multiple(value, step):
        raise ValueError(f"{name} must align to {step:.3f} mm extrusion increments, got {value}")
    return round(value, 6)
