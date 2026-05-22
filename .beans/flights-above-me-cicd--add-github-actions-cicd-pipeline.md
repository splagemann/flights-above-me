---
# flights-above-me-cicd
title: Add GitHub Actions CI/CD pipeline
status: completed
type: task
priority: normal
created_at: 2026-05-22T00:00:00Z
updated_at: 2026-05-22T21:03:06Z
---

GitHub Actions → GHCR → Watchtower pipeline. Lint runs on all PRs; build+push to GHCR on merges to main; Watchtower on server polls every 60s and auto-redeploys.

Remaining manual steps on server:
1. Make GHCR package `flights-above-me` public (GitHub Settings → Packages)
2. SSH in and run `docker compose pull && docker compose up -d` to start watchtower

## Summary of Changes

Completed via PR #3 (commit 63b23f4): GitHub Actions workflow runs lint on PRs and builds+pushes the image to GHCR on merges to main.

compose.yml added for containerized deployment (builds locally / image ghcr.io/splagemann/flights-above-me:latest). Watchtower was dropped per user request; compose and docs carry no concrete host info. CLAUDE.md and README deploy docs updated.
