# Definition of Done (DoD)

> **Document Version**: 1.0.0  
> **Status**: Quality Assurance Gate  
> **Task Association**: ARCH-001  

---

## 1. Core Principle

An implementation task in Omnicore Unified Commerce is **NEVER** considered complete merely because:
- The TypeScript compiler reports no errors (`tsc --noEmit` passes).
- The development server runs without crashing.
- The UI renders cleanly in the browser.
- A single "happy path" interaction succeeds.

True completion requires rigorous engineering verification, adherence to security mandates, regression prevention, and factual reporting.

---

## 2. Mandatory Completion Checklist

Before any task can transition from `IN PROGRESS` to `READY FOR REVIEW`, the implementation agent must verify that all of the following criteria are fulfilled:

### Criteria 1: Approved Scope & Acceptance Criteria
- [ ] Every individual acceptance criterion listed in `.ai/TASK_QUEUE.md` for the active Task ID has been implemented.
- [ ] No unsolicited features, exploratory rewrites, or unapproved architectural modifications were introduced.
- [ ] File modifications are strictly confined to files directly relevant to the assigned task.

### Criteria 2: Security & Zero-Trust Verification
- [ ] No client-side state is treated as an authoritative security boundary.
- [ ] All new or modified endpoints enforce server-side authentication and role-based permissions.
- [ ] All external input parameters (`req.body`, `req.query`, `req.params`) are validated against strict schemas.
- [ ] No secrets, tokens, or sensitive credentials are hardcoded or committed to version control.
- [ ] Negative-path testing has verified that unauthorized or malformed requests are properly rejected (HTTP 400/401/403).

### Criteria 3: Data Integrity & Transactions
- [ ] Business-critical mutations (orders, inventory movements, financial entries) are executed transactionally.
- [ ] No unhandled race conditions or concurrency hazards were introduced.
- [ ] Immutable audit logs or movement ledgers are maintained where required.

### Criteria 4: Automated Verification & Checks
- [ ] `npm run lint` (`tsc --noEmit`) executes with **0 errors**.
- [ ] `npm run build` succeeds cleanly without warnings or failures.
- [ ] Available automated test suites execute with all tests passing.
- [ ] Verification commands and their exact outputs are recorded in `.ai/IMPLEMENTATION_REPORT.md`. (Never report checks as passed without actually executing them).

### Criteria 5: Regression & Existing Functionality Preservation
- [ ] Existing capabilities and user workflows are preserved unless explicitly modified by task requirements.
- [ ] Cross-module integrations (e.g., POS terminal referencing catalog items or currency formatting) operate normally.

### Criteria 6: Factual Reporting & Documentation
- [ ] `.ai/IMPLEMENTATION_REPORT.md` is updated with complete implementation details, file change lists, test execution logs, known limitations, and remaining risks.
- [ ] Any architectural escalation, ambiguity resolution, or follow-up recommendation is documented.
- [ ] The task status in `.ai/TASK_QUEUE.md` is updated to `READY FOR REVIEW`.

---

## 3. Approval Authority

- **Agent Authority Limit**: The implementation agent is authorized only to advance a task to:
  ```text
  READY FOR REVIEW
  ```
- **Supervisor Sole Authority**: The task may only be marked:
  ```text
  APPROVED
  ```
  by the designated human developer / engineering supervisor following an independent code review.
