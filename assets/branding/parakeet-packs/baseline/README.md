# Parakeet MFMA Team - Baseline Pack

**Pack:** Baseline

**Use:** Evergreen Parakeet identity with no season or championship claim.

Approved direction: blue and yellow, a recognizable parakeet, and a white background inside the circular bird badge. The complete logo remains transparent outside the artwork.

## Included

- **16 outlined SVG masters:** horizontal primary, stacked, wordmark and emblem, each in light-background, dark-background, black and white versions.
- **16 transparent PNG logos:** horizontal/wordmark at 3000 pixels wide, stacked at 1800, emblem at 1200.
- **16 vector PDF logos** for print and layout.
- **4 JPG logos** on white backgrounds.
- **7 social layouts:** opaque avatars at 1024, 512, 180 and 32 pixels; a 1920 x 1080 banner; a 1080 x 1080 square; and a 1080 x 1920 story. Every layout includes SVG and PNG.
- **brand-guide.pdf / brand-guide.html:** two-page palette, placement and production guide.
- **preview.png / preview.html:** overview of the logo system.
- **source/:** approved concept, outlined glyph data and reproducible vector/export scripts.
- **pack.json / manifest.json / VALIDATION.md:** pack label, file checksums and verification summary.

## Choose the right version

| Version | Use |
| --- | --- |
| `primary` | Full horizontal logo for headers, announcements and wide placements. |
| `stacked` | Square and portrait placements. |
| `wordmark` | Name-only placements where the emblem already appears nearby. |
| `emblem` | Avatars, small badges and leaderboard icons. |
| `light-bg` | White/light surfaces, with a blue MFMA TEAM subline. |
| `dark-bg` | Dark surfaces, with a yellow MFMA TEAM subline. |
| `black` / `white` | True single-color artwork, with open negative space instead of an opaque white badge. |

The full-color badge interior is opaque white in both background variants. Social avatars use a white canvas; banners, square posts and stories use a navy canvas.

## Palette

| Role | Hex |
| --- | --- |
| Racing blue | #0064D8 |
| Parakeet yellow | #FFE100 |
| Wing blue | #009EEB |
| Detail navy | #07356F |
| White badge | #FFFFFF |
| Social backdrop navy | #061A36 |

Colors are RGB. Print providers should handle profile conversion and supply a proof. Use single-color artwork for small embroidery and have the fabricator confirm reproduction of the eye and wing details.

## Source and site use

The package is stored in `assets/branding/parakeet-packs/baseline/`. The existing production PNG paths now contain this pack's dark-background primary logo and white-badge emblem. The team accent and cache versions are integrated with these production assets. The previous images are saved in `assets/branding-candidates/parakeet-legacy-v2/`. Deployment status is recorded separately from this reusable pack.

The approved concept was created with the built-in image tool: “Use blue and yellow and a recognizable parakeet; change only the circular badge interior to white.” Vector masters follow that concept with flat colors and outlined lettering. All PDF and SVG logo artwork is vector; the approved raster reference is kept separately in `source/`.

## Rebuilding

From the repository root, run `python3 assets/branding/parakeet-packs/baseline/source/build.py` with Pillow and NumPy available, then `node assets/branding/parakeet-packs/baseline/source/export.cjs` with Playwright installed. Both commands write inside this pack.
