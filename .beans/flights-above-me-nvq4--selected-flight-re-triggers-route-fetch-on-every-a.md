---
# flights-above-me-nvq4
title: Selected flight re-triggers route fetch on every auto-refresh
status: todo
type: bug
created_at: 2026-05-22T20:33:29Z
updated_at: 2026-05-22T20:33:29Z
---

In renderAircraft(), when isSelected is true, selectFlight() is called inside forEach on every 15s refresh. This re-opens the popup and fires a (cached) route fetch unnecessarily. Should re-draw without the async flow since route is already on aircraft.route.
