# Archive inventory and authority map

| Task | Files | Archive root | Current condition |
|---|---:|---|---|
| semantic/canonical amendment | 12 | `.trellis/tasks/archive/2026-09/08-30-rkp-2-stage-6-semantic-canonical-authority-amendment` | active, technically consumed |
| Stage 6 private scale seam | 13 | `.trellis/tasks/archive/2026-09/08-26-rkp-2-stage-6-private-scale-evidence-seam-repair` | active, audit PASS |
| this closeout | 12 | `.trellis/tasks/archive/2026-09/09-01-rkp-2-stage-6-acceptance-archive-integration-closeout` | planning |

Native `task.py archive` sets `completed`/`completedAt`, moves the complete tree and commits. If a target still has an active child it may clear that child's parent, so the semantic child must archive before Stage 6. Historical `children` arrays are lineage; live current-child fields name only active tasks.
