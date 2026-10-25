# Specification index

Created: 2026-09-26T16:25:15+08:00
Updated: 2026-10-25

| Category | ID | Current path | Revision | Status | Replaces |
| --- | --- | --- | --- | --- | --- |
| Handoff | - | [../HANDOFF.md](../HANDOFF.md) | - | Current | - |
| Product architecture | ARCH | [product/ARCHITECTURE.md](product/ARCHITECTURE.md) | 3 | Current Render implementation baseline; target-provider decision superseded by PLAN-2 | [archive/final-architecture.md](archive/final-architecture.md), [archive/firebase-migration-note.md](archive/firebase-migration-note.md), archived 2026-10-18 |
| Feature | FEAT-001 | [features/FEAT-001-stabilization-and-integration-api.md](features/FEAT-001-stabilization-and-integration-api.md) | 2 | Approved 2026-10-17; complete; superseded by FEAT-002 | - |
| Plan | FEAT-001 | [plans/FEAT-001-implementation.md](plans/FEAT-001-implementation.md) | 2 | Approved 2026-10-17; complete; Revision 1 is in Git at `d928c56` | [archive/AI_IMPLEMENTATION_PLAN.md](archive/AI_IMPLEMENTATION_PLAN.md), archived in phase A1 |
| Feature | FEAT-002 | [features/FEAT-002-render-migration.md](features/FEAT-002-render-migration.md) | 1 | Historical implementation baseline; Render target decision superseded by PLAN-2 | Replaces FEAT-001/REQ-005, REQ-010 (CSP part), REQ-040 to REQ-043 |
| Plan | FEAT-002 | [plans/FEAT-002-implementation.md](plans/FEAT-002-implementation.md) | 1 | Historical; implementation complete, hosted Render deploy was pending | - |
| Plan | PLAN-2 | [plans/plan2.md](plans/plan2.md) | 1 | Implementation in progress; local app checks pass, DB verification and hosted cutover pending | Supersedes FEAT-002's Render target decision |
| Operations | OPS | [operations.md](operations.md) | - | Current instructions describe the existing Render runtime; update during PLAN-2 cutover | [archive/supabase-operations.md](archive/supabase-operations.md), archived 2026-10-21 |
| Reference | API | [api/README.md](api/README.md), [api/openapi.json](api/openapi.json) | v1 | Current | - |
| Reference | URLS | [legacy-url-map.md](legacy-url-map.md) | - | Current; A2 merged in plan phase 1 | - |
| Evidence | REVIEW | [evidence/2026-09-26-project-review.md](evidence/2026-09-26-project-review.md), copied at gate G0 from the workspace-root `PROJECT_REVIEW_REPORT.md` | - | Current | - |
| Evidence | FEAT-001 | [evidence/FEAT-001.md](evidence/FEAT-001.md) | - | Current, from plan phase 1 | - |
| Evidence | FEAT-001 A | [evidence/FEAT-001-track-a.md](evidence/FEAT-001-track-a.md) | - | Historical, A1 and A2 | - |
| Evidence | FEAT-001 C | [evidence/FEAT-001-track-c.md](evidence/FEAT-001-track-c.md) | - | Historical, C1 | - |
| Evidence | FEAT-002 | [evidence/FEAT-002.md](evidence/FEAT-002.md) | - | Current, from FEAT-002 phase 1 | - |
| Evidence | PLAN-1 | [evidence/PLAN-1.md](evidence/PLAN-1.md) | - | Complete for available local checks; no standalone dead code confirmed | `plans/plan1.md`, removed after completion at the user's request |
| Evidence | PLAN-2 | [evidence/PLAN-2.md](evidence/PLAN-2.md) | - | Local Supabase integration implemented; local DB and hosted gates pending | `plans/plan2.md` |

FEAT-001 Revision 2 was approved on 2026-10-17; all eight plan phases were completed on 2026-10-18, with the gaps listed in `HANDOFF.md`.
FEAT-002's repository implementation moved Tabang from Supabase to Render. On 2026-10-25, PLAN-2 superseded that target-provider decision and authorized a return to Supabase; the Render implementation remains the current source baseline until PLAN-2 cutover.
PLAN-1's evidence-based pruning pass is recorded in `evidence/PLAN-1.md`; its instruction file was removed after completion at the user's request. PLAN-2 defines the Supabase integration and cutover.
The track A and C status files are archived in `archive/`; `HANDOFF.md` is the only status record.
Superseded documents move to `archive/` with a first line linking their replacement.
