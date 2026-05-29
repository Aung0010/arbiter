import React, { useEffect } from 'react';
import './landing.css';

const Landing: React.FC = () => {
  useEffect(() => {
    // ─── Nav scroll state ───
    const nav = document.getElementById('main-nav');
    const onScroll = () => {
      if (nav) nav.classList.toggle('scrolled', window.scrollY > 20);
    };
    window.addEventListener('scroll', onScroll, { passive: true });

    // ─── Fallback reveal for browsers without scroll-driven animations ───
    if (!CSS.supports('animation-timeline', 'scroll()')) {
      const reveals = document.querySelectorAll('.reveal');
      const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            entry.target.classList.add('in-view');
            observer.unobserve(entry.target);
          }
        });
      }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });

      reveals.forEach(el => observer.observe(el));
    }

    // ─── Counter animation for stat numbers ───
    const counters = document.querySelectorAll('.stat-number[data-count]');

    const animateCounter = (el: Element) => {
      const targetStr = el.getAttribute('data-count');
      if (!targetStr) return;
      const target = parseFloat(targetStr);
      const suffix = (el.textContent || '').trim().replace(/[\d.]/g, '').trim();
      const isPercent = suffix.includes('%') || targetStr.includes('%');
      const isSec = suffix.includes('s');
      const duration = 1600;
      const start = performance.now();

      const tick = (now: number) => {
        const elapsed = now - start;
        const progress = Math.min(elapsed / duration, 1);
        // Ease out cubic
        const eased = 1 - Math.pow(1 - progress, 3);
        const current = target * eased;
        el.textContent = current.toFixed(1).replace(/\.0$/, '') + (isSec ? 's' : '%');
        if (progress < 1) requestAnimationFrame(tick);
      };

      requestAnimationFrame(tick);
    };

    const counterObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          animateCounter(entry.target);
          counterObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.5 });

    counters.forEach(el => counterObserver.observe(el));

    // ─── Staggered card entrance ───
    const cards = document.querySelectorAll('.feature-card, .team-card, .result-cell');
    cards.forEach((card, i) => {
      (card as HTMLElement).style.transitionDelay = `${(i % 3) * 80}ms`;
    });

    return () => {
      window.removeEventListener('scroll', onScroll);
    };
  }, []);

  return (
    <div className="landing-page-root">
      

  {/* ─── NAV ─── */}
  <nav id="main-nav" aria-label="Main navigation">
    <div className="nav-inner">
      <a href="#" className="nav-logo" aria-label="Arbiter home">
        <div className="nav-logo-mark" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 002-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
          </svg>
        </div>
        <span className="nav-wordmark">Arbiter</span>
      </a>

      <ul className="nav-links">
        <li><a href="#about">About</a></li>
        <li><a href="#how-it-works">How It Works</a></li>
        <li><a href="#results">Results</a></li>
        <li><a href="#team">Team</a></li>
      </ul>

      <div className="nav-cta">
        <a href="#results" className="btn-nav secondary">View Research</a>
        <a href="/app" className="btn-nav primary">
          Enter Arbiter
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 8h10m-4-4l4 4-4 4"/>
          </svg>
        </a>
      </div>
    </div>
  </nav>

  {/* ─── HERO ─── */}
  <section className="hero" id="hero" aria-labelledby="hero-headline">
    <div className="hero-glow-1" aria-hidden="true"></div>
    <div className="hero-glow-2" aria-hidden="true"></div>

    <div className="hero-content">
      <div className="hero-badge" aria-label="Status: Active research">
        <span className="hero-badge-dot" aria-hidden="true"></span>
        MCS19 · Monash University FYP 2026
      </div>

      <p className="hero-eyebrow">A Curated, Intelligent Concierge</p>

      <h1 className="hero-headline" id="hero-headline">
        Where collective reason<br />
        transcends the <em>singular.</em>
      </h1>

      <p className="hero-sub">
        Arbiter orchestrates multiple language models in structured debate — surfacing truth through disagreement, consensus, and the rigorous logic of a multi-agent tribunal.
      </p>

      <div className="hero-actions">
        <a href="/app" className="btn-primary" id="hero-cta">
          Enter Arbiter
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 8h10m-4-4l4 4-4 4"/>
          </svg>
        </a>
        <a href="#results" className="btn-secondary">
          View Research Results
        </a>
      </div>
    </div>

    <div className="hero-scroll" aria-hidden="true">
      <div className="hero-scroll-line"></div>
    </div>
  </section>

  {/* ─── MODELS STRIP ─── */}
  <div className="models-strip" aria-label="Supported models">
    <div className="models-strip-inner">
      <span className="models-strip-label">Models in the arena</span>
      <span className="model-pill"><span className="model-pill-dot dot-green" aria-hidden="true"></span>Gemma 3 · 12B</span>
      <span className="model-pill"><span className="model-pill-dot dot-blue" aria-hidden="true"></span>Ministral-3 · 14B</span>
      <span className="model-pill"><span className="model-pill-dot dot-purple" aria-hidden="true"></span>Qwen 2.5 · 14B</span>
      <span className="model-pill"><span className="model-pill-dot dot-green" aria-hidden="true"></span>GPT-oss · 20B</span>
      <span className="model-pill"><span className="model-pill-dot dot-blue" aria-hidden="true"></span>llama3.2 · 3B</span>
      <span className="model-pill"><span className="model-pill-dot dot-purple" aria-hidden="true"></span>Qwen3.5 · Cloud</span>
    </div>
  </div>

  {/* ─── STATS BAR ─── */}
  <div className="stats-bar" aria-label="Key performance metrics">
    <div className="stats-inner">
      <div className="stat-item reveal">
        <span className="stat-number" data-count="84.9">0%</span>
        <span className="stat-label">Peak System Accuracy</span>
        <div className="stat-accent emerald" aria-hidden="true"></div>
      </div>
      <div className="stat-item reveal">
        <span className="stat-number" data-count="79.3">0%</span>
        <span className="stat-label">3-Model Debate Accuracy</span>
        <div className="stat-accent primary" aria-hidden="true"></div>
      </div>
      <div className="stat-item reveal">
        <span className="stat-number" data-count="62.5">0%</span>
        <span className="stat-label">Contested Case Recovery</span>
        <div className="stat-accent sapphire" aria-hidden="true"></div>
      </div>
      <div className="stat-item reveal">
        <span className="stat-number" data-count="7.5">0s</span>
        <span className="stat-label">P50 Response Time</span>
        <div className="stat-accent gold" aria-hidden="true"></div>
      </div>
    </div>
  </div>

  {/* ─── ABOUT ─── */}
  <section className="about" id="about" aria-labelledby="about-headline">
    <div className="container">
      <div className="about-grid">
        <div className="about-copy reveal">
          <p className="section-label">The Premise</p>
          <h2 className="section-headline" id="about-headline">Intelligence is rarely a solitary achievement.</h2>

          <p>Large Language Models, used in isolation, hallucinate with confidence, produce inconsistent reasoning across separate invocations, and offer little transparency into how they reached their conclusions. The <strong>Arbiter system</strong> addresses this fundamental limitation by redesigning the architecture of AI reasoning itself.</p>

          <p>Rather than trusting a single oracle, Arbiter convenes a structured deliberation: multiple independent models generating initial analyses, critiquing one another's reasoning through disciplined debate, and ultimately converging — or consciously dissenting — toward a final consensus mediated by a dedicated Arbiter judge.</p>

          <p>The result is not merely a more accurate answer. It is a more <strong>honest, traceable, and reproducible</strong> one — a collective decision process designed for the high-stakes analytical demands where single-model failures are simply unacceptable.</p>
        </div>

        <div className="about-visual reveal">
          <div className="pipeline-card" aria-label="The Arbiter pipeline">
            <p className="pipeline-title">// Arbiter Pipeline</p>

            <div className="pipeline-step">
              <div className="pipeline-step-num emerald" aria-hidden="true">01</div>
              <div className="pipeline-step-text">
                <h4>Expert Generation</h4>
                <p>Multiple specialist LLMs independently analyse the query and produce their initial structured reasoning.</p>
              </div>
            </div>

            <div className="pipeline-step">
              <div className="pipeline-step-num primary" aria-hidden="true">02</div>
              <div className="pipeline-step-text">
                <h4>Structured Debate</h4>
                <p>Models are exposed to one another's reasoning and invited to critique, defend, or revise their positions across successive rounds.</p>
              </div>
            </div>

            <div className="pipeline-step">
              <div className="pipeline-step-num sapphire" aria-hidden="true">03</div>
              <div className="pipeline-step-text">
                <h4>Arbiter Consensus</h4>
                <p>A dedicated judge model synthesises the debate, resolves contradictions, and delivers a final, reasoned verdict with full attribution.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>

  {/* ─── HOW IT WORKS ─── */}
  <section className="how-it-works" id="how-it-works" aria-labelledby="how-headline">
    <div className="container">
      <div className="how-header reveal">
        <p className="section-label">System Architecture</p>
        <h2 className="section-headline" id="how-headline">Precision-engineered for collective intelligence.</h2>
        <p className="section-sub">Every component of the Arbiter system is designed to surface the best reasoning, not merely the fastest answer.</p>
      </div>

      <div className="features-grid">

        <div className="feature-card reveal">
          <div className="feature-icon emerald" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
          </div>
          <h3>Multi-Model Deliberation</h3>
          <p>Up to three distinct language models engage the same query independently before any cross-pollination occurs, preserving epistemic diversity.</p>
        </div>

        <div className="feature-card reveal">
          <div className="feature-icon primary" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
            </svg>
          </div>
          <h3>Structured Critique Rounds</h3>
          <p>Each debate round is formalized — models do not simply agree; they must justify their positions or formally revise them in response to peer critique.</p>
        </div>

        <div className="feature-card reveal">
          <div className="feature-icon sapphire" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          </div>
          <h3>Arbiter Judge</h3>
          <p>A dedicated Arbiter model receives the full debate log and synthesises a final verdict — with explicit reasoning, not a silent majority vote.</p>
        </div>

        <div className="feature-card reveal">
          <div className="feature-icon gold" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </div>
          <h3>Measurable Performance Gains</h3>
          <p>Benchmarked on MedQA, Arbiter's pipeline consistently surpasses the best individual model by statistically significant margins across all test series.</p>
        </div>

        <div className="feature-card reveal">
          <div className="feature-icon ruby" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
          </div>
          <h3>Full Transparency</h3>
          <p>Every debate round is logged and surfaced in the UI. Users see exactly which model said what — and why the Arbiter reached its conclusion.</p>
        </div>

        <div className="feature-card reveal">
          <div className="feature-icon neutral" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
            </svg>
          </div>
          <h3>Local-First Runtime</h3>
          <p>Built on Ollama, Arbiter runs entirely on local hardware — enabling cost control, experimental repeatability, and sovereignty over sensitive queries.</p>
        </div>

      </div>
    </div>
  </section>

  {/* ─── RESULTS ─── */}
  <section className="results" id="results" aria-labelledby="results-headline">
    <div className="container results-inner">
      <div className="results-header reveal">
        <p className="section-label">Benchmark Evidence</p>
        <h2 className="section-headline" id="results-headline">Numbers that speak without equivocation.</h2>
        <p className="section-sub">All benchmarks conducted on the Layered-Labs/BenchBase MedQA dataset — a recognised standard for assessing complex clinical reasoning under multi-choice pressure.</p>
      </div>

      <div className="results-grid reveal" aria-label="Top-line results">
        <div className="result-cell">
          <span className="result-metric emerald">+7.2pp</span>
          <p className="result-label">Accuracy Lift</p>
          <p className="result-desc">3-model debate system over the strongest single baseline on the full benchmark.</p>
        </div>
        <div className="result-cell">
          <span className="result-metric primary">64.7%</span>
          <p className="result-label">Error Recovery Rate</p>
          <p className="result-desc">Of initially incorrect answers corrected through the pipeline's structured debate process.</p>
        </div>
        <div className="result-cell">
          <span className="result-metric sapphire">0%</span>
          <p className="result-label">Pipeline Degradation</p>
          <p className="result-desc">Zero cases where the debate pipeline produced a worse outcome than individual models acting alone.</p>
        </div>
      </div>

      {/* Benchmark table */}
      <div className="reveal" style={{ overflowX: 'auto' }}>
        <table className="benchmark-table" aria-label="Full benchmark results by model configuration">
          <thead>
            <tr>
              <th scope="col">Configuration</th>
              <th scope="col">Model(s)</th>
              <th scope="col">Accuracy</th>
              <th scope="col">Performance</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Baseline · 12B</td>
              <td>Gemma3:12b</td>
              <td>68.9%</td>
              <td>
                <div className="accuracy-bar-wrap">
                  <div className="accuracy-bar-bg"><div className="accuracy-bar-fill bar-emerald" style={{ width: '68.9%' }}></div></div>
                  <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)', whiteSpace: 'nowrap' }}>68.9%</span>
                </div>
              </td>
            </tr>
            <tr>
              <td>Baseline · 14B</td>
              <td>Ministral-3:14b</td>
              <td>76.3%</td>
              <td>
                <div className="accuracy-bar-wrap">
                  <div className="accuracy-bar-bg"><div className="accuracy-bar-fill bar-primary" style={{ width: '76.3%' }}></div></div>
                  <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)', whiteSpace: 'nowrap' }}>76.3%</span>
                </div>
              </td>
            </tr>
            <tr>
              <td>Baseline · Cloud</td>
              <td>Qwen2.5:14b</td>
              <td>73.1%</td>
              <td>
                <div className="accuracy-bar-wrap">
                  <div className="accuracy-bar-bg"><div className="accuracy-bar-fill bar-sapphire" style={{ width: '73.1%' }}></div></div>
                  <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)', whiteSpace: 'nowrap' }}>73.1%</span>
                </div>
              </td>
            </tr>
            <tr className="highlight">
              <td>3-Model Debate</td>
              <td>Full pipeline</td>
              <td>79.3%</td>
              <td>
                <div className="accuracy-bar-wrap">
                  <div className="accuracy-bar-bg"><div className="accuracy-bar-fill bar-highlight" style={{ width: '79.3%' }}></div></div>
                  <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.7)', whiteSpace: 'nowrap' }}>79.3%</span>
                </div>
              </td>
            </tr>
            <tr className="highlight">
              <td>2-Model + Judge</td>
              <td>Full system · GPT-oss 20B</td>
              <td>84.9%</td>
              <td>
                <div className="accuracy-bar-wrap">
                  <div className="accuracy-bar-bg"><div className="accuracy-bar-fill" style={{ width: '84.9%', background: 'var(--c-emerald-mid)' }}></div></div>
                  <span style={{ fontSize: '12px', color: 'white', whiteSpace: 'nowrap', fontWeight: 700 }}>84.9%</span>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <p style={{ textAlign: 'center', fontSize: '12px', color: 'rgba(255,255,255,0.3)', marginTop: '20px', fontFamily: "'JetBrains Mono', monospace" }}>
        Dataset: Layered-Labs/benchbase-medqa · Split: test · p &lt; 0.001 (McNemar) against strongest single-model baseline
      </p>
    </div>
  </section>

  {/* ─── PHILOSOPHY ─── */}
  <section className="philosophy" id="philosophy" aria-labelledby="philosophy-headline">
    <div className="container">
      <div className="philosophy-grid">
        <div className="philosophy-quote reveal">
          <blockquote>
            "The strength of an argument lies not in the forcefulness of a single voice, but in the integrity of the process that tested it — and found it either wanting, or worthy."
          </blockquote>
        </div>

        <div className="philosophy-pillars reveal">
          <p className="section-label">Design Philosophy</p>
          <h2 className="section-headline" id="philosophy-headline">Built on three uncompromising principles.</h2>

          <div className="pillar">
            <div className="pillar-icon emerald" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <h4>Epistemic Humility</h4>
              <p>No model is assumed to be the authority. Every answer is treated as a hypothesis until validated by peer scrutiny.</p>
            </div>
          </div>

          <div className="pillar">
            <div className="pillar-icon primary" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <h4>Traceable Accountability</h4>
              <p>Every reasoning step is preserved, attributed, and surfaced — creating an auditable trail from question to conclusion.</p>
            </div>
          </div>

          <div className="pillar">
            <div className="pillar-icon sapphire" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <div>
              <h4>Productive Disagreement</h4>
              <p>Conflict between models is not a failure state — it is the mechanism. Contested cases reveal the contours of genuine ambiguity.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>

  {/* ─── TEAM ─── */}
  <section className="team" id="team" aria-labelledby="team-headline">
    <div className="container">
      <div className="team-header reveal">
        <p className="section-label">The People</p>
        <h2 className="section-headline" id="team-headline">A collaboration born of rigorous inquiry.</h2>
        <p className="section-sub" style={{ margin: '0 auto' }}>Built by the MCS19 group at Monash University as a Final Year Project, with equal parts engineering precision and intellectual curiosity.</p>
      </div>

      <div className="team-grid">
        <div className="team-card reveal">
          <div className="team-avatar a" aria-hidden="true">A</div>
          <p className="team-name">Ayesha Dalwai</p>
          <p className="team-role">Team Lead · Systems</p>
          <p className="team-focus">Orchestration architecture, pipeline design, and system integration.</p>
        </div>

        <div className="team-card reveal">
          <div className="team-avatar b" aria-hidden="true">J</div>
          <p className="team-name">Yanxi Zhou (Jimmy)</p>
          <p className="team-role">Research · Benchmarks</p>
          <p className="team-focus">MedQA evaluation design, statistical analysis, and benchmark methodology.</p>
        </div>

        <div className="team-card reveal">
          <div className="team-avatar c" aria-hidden="true">K</div>
          <p className="team-name">Aung Phyo Kyaw (Kevin)</p>
          <p className="team-role">Backend · Infrastructure</p>
          <p className="team-focus">Ollama runtime, Express API, multi-model concurrency management.</p>
        </div>

        <div className="team-card reveal">
          <div className="team-avatar d" aria-hidden="true">T</div>
          <p className="team-name">Tadiwa Kennedy Vambe</p>
          <p className="team-role">Frontend · Experience</p>
          <p className="team-focus">React interface, debate visualisation, and real-time session management.</p>
        </div>
      </div>

      <div className="team-institution-row">
        <div className="team-institution">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 14l9-5-9-5-9 5 9 5z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 14l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14z" />
          </svg>
          Monash University · Faculty of IT · FYP 2026 · MCS19
        </div>
      </div>
    </div>
  </section>

  {/* ─── CTA ─── */}
  <section className="cta-section" id="enter" aria-labelledby="cta-headline">
    <div className="cta-inner reveal">
      <p className="section-label">Enter the Deliberation Chamber</p>
      <h2 className="cta-headline" id="cta-headline">
        Calm. Precise.<br />Unshakeably certain.
      </h2>
      <p className="cta-sub">
        Experience the difference between a single voice and a chorus of disciplined minds. Submit a question. Watch the debate unfold. Receive an answer you can trust.
      </p>
      <a href="/app" className="cta-btn" id="main-cta">
        Enter Arbiter
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
        </svg>
      </a>
      <p className="cta-note">Requires local Ollama runtime on port 5050 · Backend on port 3001</p>
    </div>
  </section>

  {/* ─── FOOTER ─── */}
  <footer>
    <div className="footer-inner">
      <a href="#" className="footer-logo" aria-label="Back to top">
        <div className="nav-logo-mark" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ width: '16px', height: '16px', color: 'white' }}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 002-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
          </svg>
        </div>
        <span className="footer-logo-text">Arbiter</span>
      </a>

      <p className="footer-copy">© 2026 MCS19 · Monash University. Academic research project.</p>

      <ul className="footer-links">
        <li><a href="#about">About</a></li>
        <li><a href="#results">Results</a></li>
        <li><a href="/app">Enter App</a></li>
      </ul>
    </div>
  </footer>



    </div>
  );
};

export default Landing;
