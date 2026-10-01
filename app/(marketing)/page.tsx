import Link from "next/link";

import { HowPanel } from "@/components/marketing/HowPanel";
import {
  Badge,
  Eyebrow,
  OrbisGlyph,
  PhoneGlyph,
  RemoteGlyph,
  ScaleGlyph,
  Tile,
} from "@/components/marketing/primitives";
import { SessionSummaryCard } from "@/components/marketing/SessionSummaryCard";
import { claimById, formatClaimValue, type Claim } from "@/lib/evidence/claims";
import { pageMetadata } from "@/lib/seo";
import { SITE } from "@/lib/site";

export const metadata = pageMetadata({
  title: "Face your fear at your pace",
  description: SITE.tagline,
  path: "/",
  og: "kind=home",
});

const CLOSE_RED = "#d93b3b";
const ACCENT_BLUE = "#3b71f0";
const INK = "#0b0b0c";

const PROBLEM_CARDS = [
  {
    glyph: "◎",
    featured: false,
    title: "In-vivo is hard to arrange",
    copy: "In-office exposure is often hard or impossible to set up, and impractical outside it.",
    stat: "in-vivo",
    statLabel: "Setting up the real thing",
    tag: "Frontiers 2019",
    href: "https://www.frontiersin.org/journals/psychiatry/articles/10.3389/fpsyt.2019.00773/full",
  },
  {
    glyph: "▷",
    featured: true,
    title: "Therapists improvise with videos",
    copy: "In interviews, 12 of 18 therapists adapted exposure to telehealth with online resources. A screen-shared clip can't wait, press on, or back off.",
    stat: "12 / 18",
    statLabel: "therapists adapted exposure with online resources",
    tag: "PMC",
    href: "https://www.ncbi.nlm.nih.gov/pmc/articles/PMC11376200/",
  },
  {
    glyph: "≡",
    featured: false,
    title: "VR stays on the shelf",
    copy: "In a 2025 survey of 694 clinicians, about 1.4% used VR exposure, which needs headsets and content per phobia.",
    stat: "1.4%",
    statLabel: "Clinicians using VR exposure",
    tag: "n = 694",
    href: "https://www.frontiersin.org/journals/psychiatry/articles/10.3389/fpsyt.2025.1549090/full",
  },
] as const;

const SAFETY_RULES = [
  {
    glyph: "◎",
    title: "Expectancy tests",
    type: "Every trial",
    copy: "Intake captures the outcome you dread and how likely it feels. The top step stages a benign version, then you re-rate.",
  },
  {
    glyph: "✓",
    title: "Never renders harm",
    type: "Lint-enforced",
    copy: "No bite, attack, fall, crash, blood or injury in any prompt. The feared-outcome text never reaches the model.",
  },
  {
    glyph: "Ⅱ",
    title: "You stay in control",
    type: "Always",
    copy: "Pause is one key away. Overwhelm eases the scene off, at most once every ~11 s, so the tool never rewards escape.",
  },
] as const;

const SPIDER_LADDER = [
  { level: "L1", prompt: "A small house spider rests in a corner of the ceiling" },
  { level: "L2", prompt: "The spider walks slowly down the wall" },
  { level: "L3", prompt: "The spider stops on the windowsill" },
  { level: "L4", prompt: "The spider crosses the table toward the camera" },
] as const;

const HEADLINE_CLAIM_IDS = ["F-TTF", "F-RESP", "F-CUT"] as const;

const FAQS = [
  {
    q: "Is this therapy?",
    a: "No. Unflinch is a practice tool, not a medical device, and makes no treatment claims. It is designed for use alongside a clinician running exposure.",
  },
  {
    q: "Which fears are supported?",
    a: "Dogs and heights have hand-written ladders. Spiders, snakes, birds, flying, thunderstorms, open water, elevators, high bridges and darkness are generated and linted. Social fears, needles, blood, vomit and trauma cues are excluded.",
  },
  {
    q: "Do I need a headset or an app?",
    a: "No. A laptop browser shows the scene. A phone on your chest reads breathing through the browser. Without a phone you rate distress 0–9.",
  },
  {
    q: "What happens if it gets too much?",
    a: "Press Space to pause. A distress rating of 9 or an overwhelm signal eases the scene back one step at the next opportunity. You can always step back yourself.",
  },
  {
    q: "Is my session recorded?",
    a: "Only with your consent, and only the generated video. Unflinch never opens your camera. No accounts, no names.",
  },
] as const;

/** Illustrative trial trace for the "Moves with your body" device frame. */
const TRACE_LEVELS = [1, 2, 3, 4, 3, 3, 4, 5] as const;

function LevelTrace() {
  const width = 296;
  const height = 120;
  const maxLevel = 6;
  const stepWidth = width / TRACE_LEVELS.length;
  const y = (level: number) => height - 8 - ((level - 1) / (maxLevel - 1)) * (height - 16);

  const segments = TRACE_LEVELS.map((level, index) => {
    const previous = index === 0 ? level : TRACE_LEVELS[index - 1]!;
    const x0 = index * stepWidth;
    const x1 = x0 + stepWidth;
    const retreat = level < previous;
    return {
      key: index,
      d: `M${x0} ${y(previous)}V${y(level)}H${x1}`,
      stroke: retreat ? CLOSE_RED : ACCENT_BLUE,
    };
  });

  return (
    <svg
      className="m-device-chart"
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label="Illustrative level trace: levels 1, 2, 3, 4, back to 3, hold, then 4 and 5"
    >
      {[1, 2, 3, 4, 5, 6].map((level) => (
        <line
          key={level}
          x1={0}
          x2={width}
          y1={y(level)}
          y2={y(level)}
          stroke="#e7e9ee"
          strokeWidth={1}
        />
      ))}
      {segments.map((segment) => (
        <path
          key={segment.key}
          d={segment.d}
          fill="none"
          stroke={segment.stroke}
          strokeWidth={2.25}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
    </svg>
  );
}

type ProblemCardData = (typeof PROBLEM_CARDS)[number];

function SourceLink({ href, glass = false }: { href: string; glass?: boolean }) {
  return (
    <a
      className={`m-inner-button${glass ? " m-inner-button-glass" : ""}`}
      href={href}
      target="_blank"
      rel="noreferrer"
    >
      Read the source <span aria-hidden="true">↗</span>
    </a>
  );
}

function ProblemCard({ card }: { card: ProblemCardData }) {
  return (
    <article className={`m-why-card${card.featured ? " is-featured" : ""}`}>
      <span className="m-why-icon" aria-hidden="true">
        {card.glyph}
      </span>
      <h3>{card.title}</h3>
      <p>{card.copy}</p>
      {card.featured ? (
        <div className="m-why-art m-why-art-stat">
          <strong>{card.stat}</strong>
          <span>{card.statLabel}</span>
          <SourceLink href={card.href} glass />
        </div>
      ) : (
        <div className="m-why-inner">
          <div className="m-field">
            <span>{card.statLabel}</span>
            <div className="m-field-row">
              <strong>{card.stat}</strong>
              <span className="m-field-tag">{card.tag}</span>
            </div>
          </div>
          <SourceLink href={card.href} />
        </div>
      )}
    </article>
  );
}

function EvidenceCard({ claim }: { claim: Claim }) {
  return (
    <article className="m-evidence-card">
      <span className="m-evidence-id">{claim.id}</span>
      <h3>{claim.label}</h3>
      <strong className="m-evidence-value" data-status={claim.status}>
        {formatClaimValue(claim)}
      </strong>
      <p>Target: {claim.threshold}</p>
      <span className="m-evidence-n">n = {claim.n}</span>
    </article>
  );
}

export default function MarketingHome() {
  const headlineClaims = HEADLINE_CLAIM_IDS.map((id) => claimById(id)).filter(
    (claim): claim is Claim => claim !== undefined,
  );

  return (
    <main>
      <section className="m-hero m-container">
        <Eyebrow>Live · Body-paced · One continuous take</Eyebrow>
        <h1>Practise facing your fear. It moves at the speed of your nervous system.</h1>
        <p className="m-hero-description">
          Name a fear and the outcome you dread. Unflinch generates it live, and it waits, presses
          on, or backs off with your body, every two seconds.
        </p>
        <div className="m-actions">
          <Link className="m-button" href="/try">
            Try it, no signup
          </Link>
          <Link className="m-button m-button-secondary" href="/runs/canonical">
            Watch a live run <span aria-hidden="true">▷</span>
          </Link>
        </div>

        <div className="m-hero-panels">
          <div className="m-panel-art m-art-neutral">
            <div className="m-float-card">
              <span className="m-float-mark m-float-keep" aria-hidden="true">
                ↘
              </span>
              <div>
                <strong>Easing off</strong>
                <small>Breath spiked · the terrier lies down</small>
              </div>
              <span className="m-float-value">L4 → L3</span>
            </div>
            <div className="m-float-card">
              <span className="m-float-mark m-float-close" aria-hidden="true">
                ↗
              </span>
              <div>
                <strong>You stepped closer</strong>
                <small>Patient choice · camera walks forward</small>
              </div>
              <span className="m-float-value">L3 → L4</span>
            </div>
          </div>

          <div className="m-panel-art m-art-cool m-app-stage">
            <SessionSummaryCard />
            <div className="m-stat-float">
              <strong>Expectancy re-rated</strong>
              <div className="m-stat-meter">
                <span style={{ width: "30%" }} />
              </div>
              <p>
                <span>80% → 30%</span>
                <b>BUILDER DEMO</b>
              </p>
            </div>
            <div className="m-bubbles" aria-hidden="true">
              <span className="m-bubble">SUDS</span>
              <span className="m-bubble">Breath</span>
            </div>
          </div>
        </div>
        <p className="m-hero-caption">
          Illustrative interface. Measured numbers live on <Link href="/proof">/proof</Link>.
        </p>

        <div className="m-stack-strip">
          <p>Live world on one side. Your body on the other.</p>
          <div>
            <span>
              <Tile tone="accent">
                <OrbisGlyph />
              </Tile>
              Visko Orbis
            </span>
            <i />
            <span>
              <Tile tone="strong">
                <PhoneGlyph />
              </Tile>
              Phone on chest
            </span>
            <i />
            <span>
              <Tile>
                <ScaleGlyph />
              </Tile>
              SUDS 0–10
            </span>
            <i />
            <span>
              <Tile>
                <RemoteGlyph />
              </Tile>
              Therapist remote
            </span>
          </div>
        </div>
      </section>

      <section id="problem" className="m-container m-section">
        <div className="m-centered-heading">
          <Eyebrow>The problem</Eyebrow>
          <h2>Exposure works. Arranging the fear doesn&rsquo;t.</h2>
          <p>
            Specific phobia affects about 9% of US adults in a given year. Graded exposure is the
            best-supported treatment, but the feared thing has to be in the room, at the right
            intensity.
          </p>
        </div>

        <div className="m-three-up">
          {PROBLEM_CARDS.map((card) => (
            <ProblemCard key={card.title} card={card} />
          ))}
        </div>
      </section>

      <section id="how" className="m-container m-section">
        <Eyebrow>How it works</Eyebrow>
        <div className="m-section-heading">
          <div>
            <h2>
              Say it once.
              <br />
              Face it live.
            </h2>
          </div>
          <p>
            One sentence becomes a ladder of small, single-action steps. A deterministic controller
            picks the next step from your body and your choices, and Orbis morphs the same scene
            instead of cutting.
          </p>
        </div>
        <HowPanel />
      </section>

      <section id="why" className="m-container m-section">
        <Eyebrow>Why it has to be live</Eyebrow>
        <div className="m-section-heading">
          <div>
            <h2>A clip can&rsquo;t wait for you.</h2>
          </div>
          <p>
            Orbis morphs one continuous scene at chunk boundaries and keeps the subject in memory.
            The dog walks closer or lies down. Nothing cuts.
          </p>
        </div>

        <div className="m-feature-grid">
          <article className="m-feature">
            <span className="m-feature-icon" aria-hidden="true">
              ↗
            </span>
            <h3>Moves with your body</h3>
            <p>
              Your breathing and your choices set the next step. The controller decides every two
              chunks and logs which rule fired.
            </p>
            <div className="m-device">
              <div className="m-device-status">
                <span>Trial 1</span>
                <span>LIVE</span>
              </div>
              <h4>Level over time</h4>
              <LevelTrace />
              <div className="m-device-legend">
                <div>
                  <em style={{ background: CLOSE_RED }} />
                  <span>CEILING_BODY · retreat</span>
                  <span>c18</span>
                </div>
                <div>
                  <em style={{ background: ACCENT_BLUE }} />
                  <span>PATIENT_CLOSER · approach</span>
                  <span>c31</span>
                </div>
                <div>
                  <em style={{ background: INK }} />
                  <span>VARIABILITY · hold</span>
                  <span>c40</span>
                </div>
              </div>
              <div className="m-chip-float">
                <span className="m-chip-bars" aria-hidden="true">
                  <i style={{ height: "40%" }} />
                  <i style={{ height: "75%" }} />
                  <i style={{ height: "100%" }} />
                </span>
                <span>
                  <span>Decision every</span>
                  <strong>2 chunks</strong>
                </span>
              </div>
            </div>
          </article>

          <article className="m-feature">
            <span className="m-feature-icon" aria-hidden="true">
              ≡
            </span>
            <h3>Your fear, from a sentence</h3>
            <p>
              Intake turns one sentence into a graded ladder, and every step is linted for harm
              before it reaches the model.
            </p>
            <div className="m-device">
              <div className="m-device-status">
                <span>Ladder</span>
                <span>linted</span>
              </div>
              <h4>Generated for: spiders</h4>
              <div className="m-device-rows">
                {SPIDER_LADDER.map((step) => (
                  <div key={step.level}>
                    <Tile tone="accent" mono>
                      {step.level}
                    </Tile>
                    <div>
                      <strong>{step.prompt}</strong>
                    </div>
                    <Badge keep>lint ok</Badge>
                  </div>
                ))}
              </div>
              <div className="m-chip-float">
                <span className="m-chip-bars" aria-hidden="true">
                  <i style={{ height: "30%" }} />
                  <i style={{ height: "60%" }} />
                  <i style={{ height: "100%" }} />
                </span>
                <span>
                  <span>Fears in v1</span>
                  <strong>11</strong>
                </span>
              </div>
            </div>
          </article>
        </div>
      </section>

      <section id="safety" className="m-integrations">
        <div className="m-container">
          <div className="m-centered-heading">
            <Eyebrow>Clinical rules</Eyebrow>
            <h2>Built on inhibitory learning, with hard safety rails.</h2>
            <p>Rules map to Craske et al. 2014. The body signal sets a ceiling, never a floor.</p>
          </div>
          <div className="m-integration-cards">
            {SAFETY_RULES.map((rule, index) => (
              <article key={rule.title}>
                <Tile tone={index === 0 ? "accent" : index === 1 ? "strong" : "soft"}>
                  {rule.glyph}
                </Tile>
                <h3>{rule.title}</h3>
                <span>{rule.type}</span>
                <p>{rule.copy}</p>
              </article>
            ))}
          </div>
          <a
            className="m-button m-button-secondary"
            href={`${SITE.repo}/blob/main/docs/CLAIM_LEDGER.md`}
            target="_blank"
            rel="noreferrer"
          >
            Read the claim ledger
          </a>
        </div>
      </section>

      <section id="evidence" className="m-container m-section">
        <Eyebrow>Evidence</Eyebrow>
        <div className="m-section-heading">
          <div>
            <h2>Measured, not claimed.</h2>
          </div>
          <p>
            Every number links to raw evidence with n and provenance. Until a run is measured it
            says pending.
          </p>
        </div>
        <div className="m-evidence-grid">
          {headlineClaims.map((claim) => (
            <EvidenceCard key={claim.id} claim={claim} />
          ))}
        </div>
        <div className="m-evidence-actions">
          <Link className="m-button m-button-secondary" href="/proof">
            Open the proof campaign
          </Link>
        </div>
      </section>

      <section className="m-container m-section m-faq">
        <div>
          <Eyebrow>Questions</Eyebrow>
          <h2>
            Honest answers.
            <br />
            No efficacy claims.
          </h2>
          <p>{SITE.disclaimer} Built to sit alongside a clinician running exposure.</p>
        </div>
        <div>
          {FAQS.map((item) => (
            <details key={item.q}>
              <summary>
                {item.q}
                <span aria-hidden="true">+</span>
              </summary>
              <p>{item.a}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="m-container">
        <div className="m-final">
          <Eyebrow>Ready when you are</Eyebrow>
          <h2>Face it at your pace.</h2>
          <p>
            Try the keyboard mode in your browser, or set up a session with a phone and a therapist
            link.
          </p>
          <Link href="/try" className="m-button">
            Try it, no signup
          </Link>
          <Link href="/start" className="m-final-secondary">
            Therapist? Start a session
          </Link>
          <a href={SITE.therapistMailto} className="m-final-secondary">
            For therapists: email us
          </a>
        </div>
      </section>
    </main>
  );
}
