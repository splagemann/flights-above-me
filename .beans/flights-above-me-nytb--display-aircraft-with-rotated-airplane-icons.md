---
# flights-above-me-nytb
title: Display aircraft with rotated airplane icons
status: completed
type: feature
priority: normal
created_at: 2026-05-22T21:25:04Z
updated_at: 2026-05-22T21:25:35Z
---

Replace the circle markers on the Leaflet map with SVG airplane icons that rotate to match each aircraft's heading. Overhead aircraft use a distinct color; selected aircraft have a white stroke.

## Summary of Changes\n\nReplaced  with  +  using an inline SVG airplane shape. The icon rotates via  inside the SVG. Overhead aircraft render in gold (), normal in red (), selected get a white stroke. Added  CSS rule to clear Leaflet's default divIcon background/border.
