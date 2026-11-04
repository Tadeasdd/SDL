import Link from "next/link";
import { HeroScene } from "@/components/landing/HeroScene";
import { computeLandingFigures } from "@/lib/landing-figures";
import "./landing.css";

const REPO = "https://github.com/Tadeasdd/SDL";

const STAGES = [
  ["Evidence", "Drawings, registers, scans, SOPs and run logs, as they already exist."],
  ["Agent", "Claude reads everything, reconciles the contradictions and decides what is true."],
  ["Tools", "Typed tools fit durations and write the twin. Citations are checked against the source."],
  ["Twin", "One immutable model: geometry, instruments, transport, workflows, provenance."],
  ["Simulator", "Seeded discrete-event runs with Monte Carlo ranges and paired comparisons."],
];

const signedPct = (value: number): string => `${value >= 0 ? "+" : "−"}${Math.abs(value).toFixed(1)}%`;

export default function Home() {
  const figures = computeLandingFigures();
  const { top, door, path } = figures;
  return (
    <div className="site">
      <nav className="nav" aria-label="Main">
        <Link href="/" className="logo wide">SDL</Link>
        <ul>
          <li className="nav-hide"><a href="#method">Method</a></li>
          <li className="nav-hide"><a href="#findings">Findings</a></li>
          <li className="nav-hide"><a href="#simulation">Simulation</a></li>
          <li><a href={REPO}>GitHub</a></li>
          <li><Link className="nav-cta" href="/console">Console ↗</Link></li>
        </ul>
      </nav>

      <header className="hero">
        <div className="hero-canvas" aria-hidden><HeroScene twin={figures.twin} /></div>
        <div className="hero-copy">
          <h1>Your lab,<br /><em>compiled.</em></h1>
          <p className="hero-lede">SDL sends an AI agent through the records your lab already keeps. It builds a digital twin where every value cites its source, then lets you simulate a change before you touch a plate.</p>
          <Link className="cta" href="/console">Watch it map a lab ↗</Link>
          <a className="cta cta-ghost" href={REPO}>Read the source</a>
        </div>
        <dl className="readout-strip">
          <div><dd>{figures.documents}</dd><dt className="label">Documents read</dt></div>
          <div><dd>{figures.entities}</dd><dt className="label">Entities mapped</dt></div>
          <div><dd>{figures.findings.length}</dd><dt className="label">Contradictions surfaced</dt></div>
          <div><dd>{figures.baseline.toFixed(2)}</dd><dt className="label">Plates per hour, simulated</dt></div>
        </dl>
      </header>

      <section className="triad" id="method" aria-label="Method">
        <article>
          <span className="label">01 / Map</span>
          <h2>Read what is on file</h2>
          <p>No new sensors to start. The agent works from floor plans, asset registers, network scans, SOPs and run logs, and tells you where they disagree.</p>
        </article>
        <article>
          <span className="label">02 / Model</span>
          <h2>Cite every value</h2>
          <p>Each room, instrument and step carries evidence, confidence and status. A quote that is not in the source is rejected before it reaches the twin.</p>
        </article>
        <article>
          <span className="label">03 / Simulate</span>
          <h2>Test the change first</h2>
          <p>Run a day of plates through the twin. Compare scenarios on paired random seeds, and see where the constraint moves next.</p>
        </article>
      </section>

      <section className="section" id="findings">
        <div className="section-head">
          <p className="label">Example run</p>
          <h2>What the agent found at Bay 4</h2>
          <p>Aldermoor Institute is fictional. Its records contradict each other on purpose, the way real ones do.</p>
        </div>
        <ol className="rows">
          {figures.findings.map((finding, index) => (
            <li key={finding.id}>
              <span className="mono">0{index + 1}</span>
              <h3>{finding.title}</h3>
              <p>{finding.resolution}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="section" id="simulation">
        <div className="section-head">
          <p className="label">Simulation</p>
          <h2>The obvious problem is not always the expensive one</h2>
          <p>The agent flagged both of these. Only one of them costs throughput today.</p>
        </div>
        <div>
          <div className="verdicts">
            <article className="is-hit">
              <span className="label">{top.isMeaningful ? "Clear gain" : "Within noise"}</span>
              <strong>{signedPct(top.gainPct)}</strong>
              <h3>{top.name}</h3>
              <p>{figures.limiter} is the limiting resource in today&apos;s configuration, so added read capacity goes straight to output.</p>
            </article>
            {door ? (
              <article>
                <span className="label">{door.isMeaningful ? "Clear gain" : "Within noise"}</span>
                <strong>{signedPct(door.gainPct)}</strong>
                <h3>{door.name}</h3>
                <p>A real constraint on the robot, and a detour on every imaged plate, but the detour is not on the critical path.</p>
              </article>
            ) : null}
          </div>
          <p className="cascade mono">
            <span>Today <strong>{figures.baseline.toFixed(2)}</strong> plates/h</span>
            {path.map((step) => (
              <span key={step.intervention.id}>→ {step.intervention.name} <strong>{step.throughputPerHour.toFixed(2)}</strong>, then limited by <strong>{step.bottleneckId}</strong></span>
            ))}
          </p>
        </div>
      </section>

      <section className="section" id="architecture">
        <div className="section-head">
          <p className="label">Architecture</p>
          <h2>The model decides. The code computes.</h2>
        </div>
        <div>
          <ol className="pipeline">
            {STAGES.map(([title, text], index) => (
              <li key={title}>
                <span className="label">0{index + 1}</span>
                <h3>{title}</h3>
                <p>{text}</p>
              </li>
            ))}
          </ol>
          <ul className="rules">
            <li><strong>No arithmetic by language model.</strong> Fits, routing and simulation are deterministic code.</li>
            <li><strong>Evidence is data.</strong> Agent tools can change the twin and nothing else.</li>
            <li><strong>Reproducible.</strong> The same twin and seed give the same trace.</li>
            <li><strong>Honest demo.</strong> The example is a labelled replay through the real tools, with {figures.toolCalls} calls and no model.</li>
          </ul>
        </div>
      </section>

      <section className="closer">
        <h2>See what your<br />lab actually is.</h2>
        <Link className="cta" href="/console">Open the console ↗</Link>
      </section>

      <footer className="foot mono">
        <span>SDL · Self-Driving Lab · MIT</span>
        <span>Figures computed by the simulator at build time, from a fictional lab.</span>
        <a href={REPO}>github.com/Tadeasdd/SDL</a>
      </footer>
    </div>
  );
}
