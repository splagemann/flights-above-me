---
# flights-above-me-cicd
title: Add GitHub Actions CI/CD pipeline
status: todo
type: task
created_at: 2026-05-22T00:00:00Z
updated_at: 2026-05-22T00:00:00Z
---

GitHub Actions → GHCR → Watchtower pipeline. Lint runs on all PRs; build+push to GHCR on merges to main; Watchtower on server polls every 60s and auto-redeploys.

Remaining manual steps on server:
1. Make GHCR package `flights-above-me` public (GitHub Settings → Packages)
2. SSH in and run `docker compose pull && docker compose up -d` to start watchtower
