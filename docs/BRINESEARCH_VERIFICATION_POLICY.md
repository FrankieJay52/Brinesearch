# BrineSearch verification policy

This policy is mandatory for BrineSearch engineering work.

## 1. Fast iteration is the default during implementation

During active implementation, run the smallest deterministic verification surface that can falsify the current change.

Use:

- tests directly related to the files and behavior being changed;
- the relevant route/data/security contract audits;
- TypeScript typecheck when TypeScript/runtime interfaces are affected;
- `npm --prefix v18 run verify:fast` when a general targeted gate is useful.

Do not repeatedly run the complete BrineSearch suite after every small edit.

A fast/targeted pass is iteration evidence only. It is never proof that a PR is ready to merge, deploy, activate, publish, or modify production permanently.

## 2. The final exact head must pass the full gate

Before a PR may be marked ready, merged, deployed, or used as the basis for a permanent production phase, the exact final head SHA must pass the full applicable BrineSearch gate.

The full gate retains all required correctness checks, including:

- all required data and route audits;
- the complete test suite;
- TypeScript typecheck;
- production build;
- built-runtime/retirement verification;
- mobile and desktop browser smoke checks;
- security/static checks;
- release packaging/deployment checks required by the phase.

If the head SHA changes after the full gate, the old full-gate result is stale. The new exact head must pass again before readiness, merge, release, activation, publication, or deployment.

## 3. Never rerun an unchanged passed gate without a reason

A gate that already passed against the same exact inputs should be reused as evidence unless newer evidence invalidates it.

Valid invalidators include:

- changed code or data;
- changed dependency or lockfile;
- changed generated artifact or digest;
- changed production state relevant to the gate;
- changed route, graph, approval, or publication state;
- changed test/audit implementation;
- a newly discovered defect that falsifies the earlier evidence.

Elapsed time alone is not an invalidator.

## 4. Fail fast on genuine failures

When a required gate genuinely fails:

1. stop that verification chain;
2. capture the exact failing command and evidence;
3. fix or diagnose the failure;
4. rerun the smallest affected gate;
5. run the complete final gate only when the candidate is again ready.

Do not burn time and usage running unrelated expensive gates after a genuine fail-stop merely to collect more failures.

## 5. CI must avoid duplicate proof work

CI should prefer:

- one production build artifact per exact SHA;
- downstream browser/package checks consuming that exact artifact where safe;
- cancellation of superseded pull-request runs;
- dependency caches keyed by lockfile/input state;
- path filters where they cannot hide relevant failures;
- short artifact retention for transient PR artifacts and longer retention only where release evidence requires it.

Do not cache pass/fail conclusions across changed inputs.

## 6. Generation and promotion are separate from routine presentation work

Expensive generation/promotion suites do not need to rerun after every unrelated presentation edit when their immutable inputs and generators are unchanged.

The ordinary gate must still retain lightweight drift assertions over already released/frozen artifacts so presentation changes cannot silently alter route authority, destinations, URLs, digests, or release state.

Before an actual generation, promotion, activation, publication, or release phase, run the complete phase-specific suite.

## 7. High-risk work stays conservative

Fast verification does not relax BrineSearch safety rules.

Changes involving production data, auth, permissions, security-definer functions, route authority, graph topology, exact junctions, approved-road policy, route locks, public Google publication, cutover, migrations, or destructive operations still require their specific read-only/preflight/security gates before any authorized write.

No fast result may be used to bypass a required production or authority gate.

## 8. Preferred working loop

Use this sequence:

`inspect current state -> make one narrow change -> targeted/fast verification -> repeat as needed -> exact candidate head -> full gate once -> review -> authorized merge/release phase`

This policy optimizes elapsed time and compute/agent usage without lowering the definition of done.
