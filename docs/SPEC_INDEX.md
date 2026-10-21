# Specification index

Created: 2026-09-26T16:25:15+08:00
Updated: 2026-10-21T15:43:00+08:00

| Category | ID | Current path | Revision | Status | Replaces |
| --- | --- | --- | --- | --- | --- |
| Handoff | - | [../HANDOFF.md](../HANDOFF.md) | - | Current | - |
| Product architecture | ARCH | [product/ARCHITECTURE.md](product/ARCHITECTURE.md) | 3 | Approved 2026-10-21; Revision 2 (approved 2026-10-17) is in Git at `f8e08d8` | [archive/final-architecture.md](archive/final-architecture.md), [archive/firebase-migration-note.md](archive/firebase-migration-note.md), archived 2026-10-18 |
| Feature | FEAT-001 | [features/FEAT-001-stabilization-and-integration-api.md](features/FEAT-001-stabilization-and-integration-api.md) | 2 | Approved 2026-10-17; complete; superseded by FEAT-002 | - |
| Plan | FEAT-001 | [plans/FEAT-001-implementation.md](plans/FEAT-001-implementation.md) | 2 | Approved 2026-10-17; complete; Revision 1 is in Git at `d928c56` | [archive/AI_IMPLEMENTATION_PLAN.md](archive/AI_IMPLEMENTATION_PLAN.md), archived in phase A1 |
| Feature | FEAT-002 | [features/FEAT-002-render-migration.md](features/FEAT-002-render-migration.md) | 1 | Approved 2026-10-21 | Replaces FEAT-001/REQ-005, REQ-010 (CSP part), REQ-040 to REQ-043 |
| Plan | FEAT-002 | [plans/FEAT-002-implementation.md](plans/FEAT-002-implementation.md) | 1 | Approved 2026-10-21; execution handed to another AI coding agent | - |
| Operations | OPS | [operations.md](operations.md) | - | Current; rewritten for Render in FEAT-002 phase 6 | [archive/supabase-operations.md](archive/supabase-operations.md), archived 2026-10-21 |
| Reference | API | [api/README.md](api/README.md), [api/openapi.json](api/openapi.json) | v1 | Current | - |
| Reference | URLS | [legacy-url-map.md](legacy-url-map.md) | - | Current; A2 merged in plan phase 1 | - |
| Evidence | REVIEW | [evidence/2026-09-26-project-review.md](evidence/2026-09-26-project-review.md), copied at gate G0 from the workspace-root `PROJECT_REVIEW_REPORT.md` | - | Current | - |
| Evidence | FEAT-001 | [evidence/FEAT-001.md](evidence/FEAT-001.md) | - | Current, from plan phase 1 | - |
| Evidence | FEAT-001 A | [evidence/FEAT-001-track-a.md](evidence/FEAT-001-track-a.md) | - | Historical, A1 and A2 | - |
| Evidence | FEAT-001 C | [evidence/FEAT-001-track-c.md](evidence/FEAT-001-track-c.md) | - | Historical, C1 | - |
| Evidence | FEAT-002 | [evidence/FEAT-002.md](evidence/FEAT-002.md) | - | Current, from FEAT-002 phase 1 | - |

FEAT-001 Revision 2 was approved on 2026-10-17; all eight plan phases were completed on 2026-10-18, with the gaps listed in `HANDOFF.md`.
FEAT-002 moves Tabang from Supabase to Render; it was approved on 2026-10-21 for execution by another AI coding agent without hard stops.
The track A and C status files are archived in `archive/`; `HANDOFF.md` is the only status record.
Superseded documents move to `archive/` with a first line linking their replacement.
