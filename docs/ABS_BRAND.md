# Arius Interactive — Brand Reference (Arleco operator)

> **Arius Black Studios is dissolved.** Arleco is operated by **Arius Interactive** (not yet incorporated). Support: help@ariusinteractive.com

The ABS logo below is **legacy only** — do not use on new Arleco surfaces.

## Legacy: Arius Black Studios logo

Quick reference for the deprecated ABS studio mark.

| | |
|---|---|
| **File** | `assets/arius-black-studios-logo.png` |
| **Format** | PNG, horizontal banner |
| **Contents** | “ARIUS BLACK STUDIOS” wordmark (3 lines, white, soft glow) + circular emblem (yellow/orange rings, white geometric sigil, wing/flame silhouette) + yellow/orange flame swirls on left/right |

## Color palette

Estimated from the logo artwork:

| Role | Hex | Notes |
|------|-----|-------|
| Black (background) | `#000000` | Banner fill, emblem silhouette |
| White (primary text) | `#FFFFFF` | Wordmark, emblem geometry |
| Bright yellow | `#FFD700` | Outer ring, flame highlights |
| Vibrant orange | `#FF8C00` | Inner ring, flame mid-tones |
| Deep orange | `#FF6600` | Flame shadows, ring transitions |
| Red accent | `#E63946` | Small details in emblem center |
| Cool grey (glow) | `#C8C8C8` | Soft white glow around type (optional UI use) |

**CSS custom properties (optional):**

```css
--abs-black: #000000;
--abs-white: #ffffff;
--abs-yellow: #ffd700;
--abs-orange: #ff8c00;
--abs-orange-deep: #ff6600;
--abs-red: #e63946;
--abs-grey-glow: #c8c8c8;
```

## Usage

### Full banner

Use the complete PNG for:

- Portfolio footer / “by Arius Black Studios” credits
- Pitch decks, social headers, or wide studio branding blocks
- Dark backgrounds where the black banner blends in or reads as intentional

Scale by **height** (e.g. 28–40px in footers; larger in hero sections). Preserve aspect ratio; do not stretch.

### Icon crop (manual)

The **circular emblem** (right side of the banner) can be cropped for:

- Favicon / app icon
- Avatar / social profile image
- Small inline mark where the full wordmark is too wide

No separate icon file exists yet; crop from the master PNG or export a square asset when needed.

### Arleco and other products

- **Arleco** uses its own neutral, product-specific palette (see `docs//` and `docs/VN_PLATFORM_DESIGN_SPEC.md`).
- Use this ABS logo for studio attribution only, e.g. “Scena **by Arius Black Studios**” — not as the Arleco product logo.

### Accessibility

- On light pages, the full banner reads clearly because of the black bar; keep sufficient padding around it.
- Always provide `alt="Arius Black Studios"` (or longer descriptive alt if the image is decorative-adjacent to visible text).
