# SDL

**Self-Driving Lab.** An AI agent reads the records a lab already keeps, compiles them into a digital twin where every value cites its source, and lets you simulate a change before you touch a plate.

![SDL landing page](docs/img/landing.jpg)

## What it does

| | |
| --- | --- |
| **Map** | Claude reads floor plans, asset registers, network scans, SOPs and run logs, and finds where they disagree. |
| **Model** | The twin holds geometry, instruments, transport and workflows. Every entity carries evidence, a confidence and a status. |
| **Simulate** | A seeded discrete-event engine runs a day of plates. Scenarios are compared on paired seeds with Monte Carlo ranges. |
| **Report** | Every candidate change is ranked by simulated gain, and the report shows where the constraint moves next. |

## The example lab

`examples/aldermoor-bay-4` is a **fictional** lab whose records contradict each other on purpose. Running it shows what SDL produces:

- The register says plate reader RDR-02 is in service. It has been silent for 11 days and went back to the vendor.
- Reads take about 610 s against the 480 s in the SOP, and the SOP claims the arm reaches an imager in another room.
- Restoring the reader gives about **+23%** throughput and moves the bottleneck to the imager.
- Door D-3 really is too narrow for the robot, yet widening it is **within noise**. A flagged problem is not always an expensive one.

![Simulate view](docs/img/simulate.jpg)

| Map | Twin | Report |
| --- | --- | --- |
| ![Map](docs/img/map.jpg) | ![Twin](docs/img/twin.jpg) | ![Report](docs/img/report.jpg) |

## Run it

Requires Node 22 or later.

```bash
npm install
npm run dev
```

Open <http://localhost:3000> for the landing page, or `/console` to watch the example get mapped. The example needs no API key.

### Map your own lab

```bash
cp .env.example .env.local   # then set ANTHROPIC_API_KEY
npm run dev
```

In the console, choose **Map your lab** and upload your files. The key stays on the server. Runs use `claude-opus-5-5` by default; set `SDL_AGENT_MODEL` to change it. A run makes many model calls with high effort, so expect real API cost.

## How it works

```
evidence ──> agent loop (Claude | scripted replay) ──> tool handlers ──> LabTwin (immutable)
                                                           │                  │
                                                     validator, router   simulator (seeded DES)
                                                                              │
                                     console (Map / Twin / Simulate / Report) + landing
```

- **The model decides, the code computes.** Claude reconciles sources. Duration fits, validation, routing and simulation are deterministic code it calls as tools.
- **Citations are checked.** A tool call citing an unknown document, or a quote that is not in the document, is rejected and returned to the model to correct.
- **Evidence is untrusted.** Tools can only change the twin. They have no network or filesystem access.
- **Replay is not Live.** The example is a scripted replay: its decisions are authored, but every call runs through the real tools, validator and simulator, and the console labels it as a replay. No model is called.

| Path | Contents |
| --- | --- |
| `src/core/twin` | Schema, immutable mutations, validator, route planner |
| `src/core/sim` | Discrete-event engine, Monte Carlo, scenarios, improvement path |
| `src/core/agent` | Tool registry, Claude loop, replay |
| `src/components` | 3D scene and console panels |
| `src/app/api/agent` | Streaming Live endpoint |
| `docs/SPEC.md` | Principles, phases, gates, risk register |

## Quality

```bash
npm run verify     # lint, types, unit tests with coverage, build
npm run test:e2e   # Playwright, after a build
```

## Limitations

- **Live mode has not been run against the real Claude API.** The loop has unit tests, and the real SDK and route were exercised against a local stub of the Messages API. How well Claude maps a real lab is unmeasured, and needs an eval set.
- The point cloud in the viewport is **synthesised from the twin**. SDL does not ingest LiDAR or photogrammetry yet. Live mode accepts images, but the example works from text and drawings.
- The simulator is a planning model. It assumes unlimited staging at hand-offs and does not model cost, labour or consumables. Treat results as comparisons, not forecasts.
- Heavy analysis runs on the main thread. The Report view pauses briefly while it computes.
- The Live endpoint's rate limit is in memory, per process. Put real authentication in front of it before deploying it publicly.

## License

MIT. Aldermoor Institute, its equipment and its model names are fictional.
