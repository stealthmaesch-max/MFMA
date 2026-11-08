# Monarch MFMA Team — complete logo package

Approved identity: a rounded M with two discreet wing cuts. Blue sits on the left, purple on the right. The circular frame and MONARCH / MFMA TEAM lockup remain the primary identity.

## Files

- `svg/`: 16 scalable, outlined vector masters. Lettering is paths, so no fonts are required.
- `png/`: 16 transparent exports. Horizontal and wordmark files are 2400 pixels wide, emblems 1024 pixels, stacked marks 1600 pixels.
- `pdf/`: 16 vector PDF exports for print and layout software.
- `jpg/`: four white-background exports for simple document use.
- `preview.html` and `preview.png`: overview of the system on light and dark backgrounds.
- `approved-concept.png`: the accepted generated concept used as the reference for the cleaned vector system.
- `archive/`: copies of the two previous site images, retained for recovery only.
- `source/`: reproducible vector construction and export scripts. The package source expects the MFMA repository layout, bundled Python dependencies and Playwright.

## Selecting a logo

| Filename part | Use |
| --- | --- |
| `primary` | Main horizontal logo; use when the full name should be visible. |
| `emblem` | Profile images, leaderboard badges and small graphics. |
| `wordmark` | Name-only placement where the emblem is already nearby. |
| `stacked` | Square or portrait layouts. |
| `light-bg` | Navy lettering and circle, for white or light backgrounds. |
| `dark-bg` | Ice-white lettering and circle, for dark backgrounds. |
| `black` / `white` | True single-color artwork for embroidery, vinyl and one-ink applications. |

All SVG and PNG backgrounds are transparent. Do not put the navy version on a dark background. The PDF exports retain vector geometry; palette values are RGB, so a print provider should handle the final print color conversion.

## Colors

| Color | Hex |
| --- | --- |
| Electric blue | `#123BFF` |
| Monarch purple | `#6B00FF` |
| Midnight navy | `#061126` |
| Ice white | `#F4F7FC` |
| Single-color black / white | `#000000` / `#FFFFFF` |

## Placement

Keep additional clear space of at least one quarter of the emblem diameter around the artwork. Keep proportions fixed. Do not stretch, rotate, add glow/shadows or replace the colors. Use the emblem when the MFMA TEAM subline would become unreadable. Suggested starting minimums: horizontal logo 280 pixels wide, emblem 40 pixels; inspect at actual size for the final medium. For small embroidery, use the single-color emblem and ask the fabricator to confirm that the wing cuts remain open.

## Site replacement

The existing site paths `assets/branding/monarch-mfma-team-logo-dignified.png` and `assets/branding/monarch-team-emblem.png` now contain the dark-background primary logo and emblem. Cache versions were advanced so existing devices request the replacement images. Native SVG masters are in `assets/branding/monarch/`. Historical candidates remain in their archive/candidate folders.

The approved concept was produced with the built-in image tool using: “Keep the clean M silhouette; suggest wings through subtle internal cuts.” Production files were cleaned and exported as vector artwork to keep all variants consistent.
