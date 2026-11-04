# SDL — Build Spec

**SDL (Self-Driving Lab)** is an AI agent that reads the evidence a lab already has — floor
plans, inventories, network scans, SOPs, run logs — and compiles it into a typed, provenance-tracked
**digital twin** that can run discrete-event simulations before anyone touches a plate.

## Product principles

1. **Nothing in the twin is unsourced.** Every entity carries evidence citations, a confidence and a
   status (`confirmed`, `inferred`, `conflict`). The UI always lets you walk back to the source.
2. **The model decides, the code computes.** Claude reads and reconciles. Arithmetic (duration fitting,
   validation, routing, simulation) is deterministic code exposed as tools, never model output.
3. **No fake numbers.** Every figure in the UI, including the landing page, is computed from the example
   twin at build or run time. The example lab is fictional and labelled so. Its instruments are real products, and their faults and timings are invented.
4. **Replay is not Live.** The example run is a scripted replay: the decisions are authored, but each one
   runs through the real tool handlers, validator and simulator. The UI labels this at all times.
5. **Evidence is untrusted input.** Agent tools can only mutate the twin. No network, no filesystem.

## Architecture

```
evidence ──> agent loop (Claude | scripted replay) ──> tool handlers ──> LabTwin (immutable)
                                                           │                  │
                                                     validator, router   simulator (seeded DES)
                                                                              │
                                     console UI (Map / Twin / Simulate / Report) + landing
```

- `src/core/twin` schema, immutable mutations, validator, route planner
- `src/core/sim` seeded discrete-event engine, Monte Carlo, scenarios, sensitivity
- `src/core/agent` tool registry, Claude loop, replay driver
- `examples/aldermoor-bay-4` fictional evidence pack with deliberate contradictions
- `src/components` 3D operating picture and console panels
- `src/app/api/agent` streaming Live-mode endpoint (the API key stays server-side)

## Phases and gates

| #   | Phase                  | Gate (pass/fail)                                                                       |
| --- | ---------------------- | -------------------------------------------------------------------------------------- |
| P0  | Scaffold, repo, CI     | `npm run typecheck` clean; repo public; CI file present                                |
| P1  | Twin core              | Schema, mutations, validator and router covered by tests                               |
| P2  | Example evidence pack  | Evidence files parse; run log regenerates byte-identically from its seed               |
| P3  | Simulator              | Same seed gives identical trace; capacity never exceeded; conservation of plates       |
| P4  | Agent core             | Replay builds a twin with zero validation errors; loop passes with a fake client       |
| P5  | Console shell + 3D     | Twin renders in WebGL with no console errors                                           |
| P6  | Map view               | Replay streams into the viewport entity by entity; skip works                          |
| P7  | Twin view              | Selecting an entity shows its provenance and opens the cited evidence                  |
| P8  | Simulate view          | Run, scrub and compare scenarios; plates animate along planned routes                  |
| P9  | Report view            | Ranked interventions come from computed sensitivity; twin exports as JSON              |
| P10 | Landing page           | All figures computed from the twin; responsive to 375px                                |
| P11 | Live mode              | Route validates input, rate-limits, streams events; returns 503 without a key          |
| P12 | Quality                | Coverage ≥ 80% on `src/core`; e2e green; CI green; README with screenshots             |

## Risk register

| Risk                                    | Mitigation                                                                     |
| --------------------------------------- | ------------------------------------------------------------------------------ |
| Model invents entities                  | Tools require evidence citations; citations are checked against loaded evidence |
| Prompt injection through evidence       | Tools only mutate the twin; system prompt marks evidence as data               |
| Live endpoint abused if deployed        | Per-IP rate limit, payload caps, turn cap, disabled without a key              |
| Simulation mistaken for a forecast      | Reported as Monte Carlo ranges with stated assumptions                          |
| WebGL unavailable                       | Plan view and entity tree expose the same data without 3D                      |
