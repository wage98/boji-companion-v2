#!/usr/bin/env python3
"""Extract the eight approved Chibi poses without redrawing the source sheet.

Requires Pillow, NumPy, and SciPy for this one-time, reviewable asset build.
The source SHA and pose seed points are pinned so source drift fails closed.
Pixels remain at source resolution; only the mask and transparent crop differ.
"""
from hashlib import sha256
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "assets/boji/source/chibi-sheet.png"
OUT = ROOT / "assets/boji/chibi-states"
SOURCE_SHA256 = "fa88b42aae79d0f4f3d01448e77ad9ccd152e7379e49f921d749a599fb041d71"
ALPHA_THRESHOLD = 64
EDGE_GUARD_PX = 2
EDGE_REPAIR_STATES = frozenset(("neutral", "sit", "happy", "sleep", "wave"))
EDGE_REPAIR_PAD_PX = 4
PAD_PX = 4
STRUCTURE = np.ones((3, 3), dtype=np.uint8)

# (filename, seed_x, seed_y, expected component bounds x0,y0,x1,y1)
POSES = (
    ("neutral", 180, 250, (26, 26, 386, 571)),
    ("encourage", 570, 260, (384, 63, 726, 570)),
    ("think", 870, 280, (733, 94, 1085, 564)),
    ("walk", 1260, 260, (1106, 24, 1433, 572)),
    ("sit", 200, 800, (30, 605, 398, 1053)),
    ("happy", 590, 810, (398, 579, 754, 1069)),
    ("sleep", 900, 900, (731, 711, 1121, 1048)),
    ("wave", 1300, 800, (1086, 572, 1441, 1071)),
)


def main():
    raw = SOURCE.read_bytes()
    actual_hash = sha256(raw).hexdigest()
    if actual_hash != SOURCE_SHA256:
        raise SystemExit(f"Approved source hash mismatch: {actual_hash}")

    sheet = Image.open(SOURCE).convert("RGBA")
    rgba = np.asarray(sheet)
    alpha = rgba[:, :, 3]
    labels, _ = ndimage.label(alpha >= ALPHA_THRESHOLD, structure=STRUCTURE)
    OUT.mkdir(parents=True, exist_ok=True)

    all_core = labels > 0
    for name, seed_x, seed_y, expected_bounds in POSES:
        component = int(labels[seed_y, seed_x])
        if component == 0:
            raise SystemExit(f"Pose seed is not inside alpha component: {name}")
        core = labels == component
        ys, xs = np.where(core)
        bounds = (int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1)
        if bounds != expected_bounds:
            raise SystemExit(f"Pose bounds changed for {name}: {bounds}")

        # Keep source pixels close to this pose's alpha>=64 core. A matching
        # guard around every other component removes disconnected sticker
        # halos. The sitting heart and sleep Zs are connected to their own
        # source poses and remain visible; the contact sheet makes that clear.
        own_edge = ndimage.binary_dilation(core, iterations=EDGE_GUARD_PX)
        other_edge = ndimage.binary_dilation(all_core & ~core, iterations=EDGE_GUARD_PX)
        keep = own_edge & ~other_edge & (alpha > 0)
        y0 = max(0, bounds[1] - PAD_PX)
        x0 = max(0, bounds[0] - PAD_PX)
        y1 = min(sheet.height, bounds[3] + PAD_PX)
        x1 = min(sheet.width, bounds[2] + PAD_PX)

        cropped = rgba[y0:y1, x0:x1].copy()
        crop_keep = keep[y0:y1, x0:x1]
        if name in EDGE_REPAIR_STATES:
            # The selected alpha>=64 pose core is protected artwork. Clear
            # only its weak antialias fringe in the four-pixel side gutters;
            # this removes contact-sheet edge residue without touching pose,
            # hair, outfit, or connected action marks.
            one_pixel_edge = ndimage.binary_dilation(core, iterations=EDGE_GUARD_PX - 1)
            local_y, local_x = np.indices(crop_keep.shape)
            side_gutter = (local_x < EDGE_REPAIR_PAD_PX) | (local_x >= crop_keep.shape[1] - EDGE_REPAIR_PAD_PX)
            source_alpha = cropped[:, :, 3].copy()
            repair = crop_keep & ~one_pixel_edge[y0:y1, x0:x1] & side_gutter & (source_alpha < ALPHA_THRESHOLD)
            if np.any(repair & core[y0:y1, x0:x1]):
                raise SystemExit(f"Refusing to alter alpha>=64 pose core: {name}")
            changed_y, changed_x = np.where(repair)
            changed_alpha = source_alpha[repair]
            crop_keep = crop_keep & ~repair
            repair_note = (
                f"alpha_removed={len(changed_x)}"
                + (f"; edge_bbox={changed_x.min()},{changed_y.min()}-{changed_x.max()},{changed_y.max()}"
                   f"; source_alpha={changed_alpha.min()}-{changed_alpha.max()}" if len(changed_x) else "")
            )
        else:
            repair_note = "alpha_removed=0"
        cropped[:, :, 3] = np.where(crop_keep, cropped[:, :, 3], 0).astype(np.uint8)
        target = OUT / f"{name}.png"
        Image.fromarray(cropped, "RGBA").save(target, format="PNG", optimize=False, compress_level=9)
        print(f"{name}\t{target.relative_to(ROOT)}\t{cropped.shape[1]}x{cropped.shape[0]}\t{repair_note}\t{sha256(target.read_bytes()).hexdigest()}")


if __name__ == "__main__":
    main()
