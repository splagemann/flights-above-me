---
# flights-above-me-ilgn
title: routeCache grows unbounded
status: todo
type: bug
created_at: 2026-05-22T20:33:29Z
updated_at: 2026-05-22T20:33:29Z
---

The routeCache Map in public/app.js is never pruned. For long-running sessions it accumulates stale entries. Add a max-size eviction or TTL.
