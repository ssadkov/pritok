import type { Metadata } from "next";
import "./landing.css";

export const metadata: Metadata = {
  title: "PriTok — bond payouts, executed on Solana",
  description:
    "PriTok automates bond corporate actions on Solana: record date, calculation, one-click payout to every holder, a receipt for each payment.",
};

const DEMO = "/demo";
const VIDEO = "https://youtu.be/LSAAGoHZc4w";
const CODE = "https://github.com/ssadkov/pritok";

const CHAIN = ["Find the owners", "Calculate", "Collect the money", "Pay everyone", "Keep the records"];

const STEPS = [
  { who: "Issuer", title: "Creates the bond", text: "Face value, coupon rate, term and size. The payment schedule is fixed in the program at issue." },
  { who: "Program", title: "Records the owners", text: "On the record date the holder register is fixed onchain. Transfers after it do not change who gets paid." },
  { who: "Issuer", title: "Sends the money", text: "Funds go into the issue's payout vault. Everyone sees how much is required and how much has arrived." },
  { who: "Operator", title: "Presses one button", text: "Every holder is paid to their wallet, each with a receipt on the blockchain. A holder can also claim earlier or to a bank." },
];

const ROLES = [
  { name: "Platform operator", text: "Every corporate action and its status in one table: register, issuer funds, execution, report per holder." },
  { name: "Issuer", text: "Creates issues and events, sees what to pay and when, funds payouts." },
  { name: "Investor", text: "Their bonds, the next payments and the full history of what was received." },
  { name: "Public registry", text: "Anyone can check the register, the schedule and every transaction." },
];

const SHOTS = [
  { src: "/shots/operator.png", title: "Operator console", text: "Coupon 1 executed for 3 of 3 holders, coupon 2 funded and ready to execute." },
  { src: "/shots/registry.png", title: "Life of an issue", text: "Four coupons and maturity paid out; bonds redeemed and burned." },
  { src: "/shots/newissue.png", title: "Issuer form", text: "The issuer sets the terms; the payment math is shown before issuing." },
  { src: "/shots/bonds.png", title: "All issues", text: "Every issue of the program on devnet, with status and amounts paid out." },
];

/** Public landing page for the KASE side track; the working app lives under /demo. */
export default function Landing() {
  return (
    <div className="lp">
      <header className="lp-top">
        <div className="lp-wrap lp-top-in">
          <a className="brand" href="/" aria-label="PriTok">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="brand-mark" src="/pritok-mark.svg" alt="" width={22} height={24} />
            <span className="brand-wordmark"><span className="brand-pri">Pri</span><span>Tok</span></span>
          </a>
          <nav className="lp-nav">
            <a href="#how">How it works</a>
            <a href="#team">Team</a>
            <a href={CODE}>Code</a>
            <a className="lp-btn small" href={DEMO}>Open demo</a>
          </nav>
        </div>
      </header>

      <section className="lp-hero">
        <div className="lp-wrap lp-hero-in">
          <div>
            <p className="lp-kicker">Superteam Kazakhstan × KASE · Corporate Actions on Blockchain</p>
            <h1>Bond payouts, executed on&nbsp;Solana</h1>
            <p className="lp-lead">
              PriTok automates the whole chain of a bond payment — owners on the record date, calculation, payout,
              receipt — from one screen, for the platform operator.
            </p>
            <div className="lp-ctas">
              <a className="lp-btn" href={DEMO}>Open the live demo</a>
              <a className="lp-btn ghost" href={VIDEO}>Watch the 2-minute video</a>
            </div>
            <p className="lp-note">Working prototype on Solana devnet · a full two-year bond in about 17 minutes · KZ / EN / RU</p>
          </div>
          <figure className="lp-shot lp-hero-shot">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/shots/operator.png" alt="PriTok operator console with corporate actions of an issue" />
          </figure>
        </div>
      </section>

      <section className="lp-sec">
        <div className="lp-wrap">
          <div className="lp-video">
            <iframe
              src="https://www.youtube-nocookie.com/embed/LSAAGoHZc4w"
              title="PriTok — bond payouts on Solana"
              loading="lazy"
              allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
        </div>
      </section>

      <section className="lp-sec">
        <div className="lp-wrap">
          <h2>Every bond payment is still a manual chain</h2>
          <div className="lp-stats">
            <div><b>800+</b><span>securities listed on KASE</span></div>
            <div><b>260+</b><span>issuers</span></div>
            <div><b>$58B</b><span>a year — global cost of corporate actions processing (industry estimate)</span></div>
          </div>
          <ol className="lp-chain">
            {CHAIN.map((s) => <li key={s}>{s}</li>)}
          </ol>
          <p className="lp-muted">
            Depositary, brokers, banks and the issuer each keep their own part. Investors often cannot see how their
            payment was calculated.
          </p>
        </div>
      </section>

      <section className="lp-sec alt" id="how">
        <div className="lp-wrap">
          <h2>One process, end to end</h2>
          <div className="lp-steps">
            {STEPS.map((s, i) => (
              <div className="lp-step" key={s.title}>
                <span className="lp-num">{i + 1}</span>
                <span className="lp-who">{s.who}</span>
                <h3>{s.title}</h3>
                <p>{s.text}</p>
              </div>
            ))}
          </div>
          <p className="lp-muted">At maturity the operator pays the principal and the bonds are burned. Kazakhstan conventions: record date per the Law "On the Securities Market", amounts in tiyn, rounded down.</p>
        </div>
      </section>

      <section className="lp-sec">
        <div className="lp-wrap lp-two">
          <div>
            <h2>If the money is not enough, nobody is paid</h2>
            <ul className="lp-rules">
              <li><b>The funds stay locked</b> until the full amount for the payment arrives.</li>
              <li><b>No favourites.</b> The issuer cannot choose who gets paid first.</li>
              <li><b>The debt stays visible</b> to every investor and to the regulator.</li>
            </ul>
          </div>
          <div>
            <h2>Why Solana</h2>
            <ul className="lp-rules">
              <li><b>Ownership, settlement and payouts</b> in one system instead of several ledgers.</li>
              <li><b>Fast and cheap</b> enough to pay thousands of holders per event.</li>
              <li><b>A tenge stablecoin</b> is already being tested on Solana in the National Bank's sandbox.</li>
            </ul>
          </div>
        </div>
      </section>

      <section className="lp-sec alt">
        <div className="lp-wrap">
          <h2>Each role sees what it needs</h2>
          <div className="lp-roles">
            {ROLES.map((r) => (
              <div key={r.name}>
                <h3>{r.name}</h3>
                <p>{r.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="lp-sec">
        <div className="lp-wrap">
          <h2>Inside the prototype</h2>
          <div className="lp-gallery">
            {SHOTS.map((s) => (
              <a className="lp-card" href={s.src} key={s.src}>
                <figure className="lp-shot">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={s.src} alt={s.title} loading="lazy" />
                </figure>
                <h3>{s.title}</h3>
                <p>{s.text}</p>
              </a>
            ))}
          </div>
          <p className="lp-muted">
            Anchor program with 18 instructions and 21 tests · Token-2022 bond mint, frozen by default, permanent delegate for
            redemption · payments in a test tenge token (tKZT).
          </p>
        </div>
      </section>

      <section className="lp-sec alt" id="team">
        <div className="lp-wrap">
          <h2>Team</h2>
          <div className="lp-team">
            <div className="lp-person">
              <div className="lp-avatar" aria-hidden="true">I</div>
              <div>
                <h3>Indira</h3>
                <p className="lp-role">Team lead</p>
                <p>Supervised training for 300 traders — knows how investors read a bond and its payments.</p>
              </div>
            </div>
            <div className="lp-person">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="lp-photo" src="/team/sergei.jpg" alt="Sergei Sadkov at the National Bank of Kazakhstan" />
              <div>
                <h3>Sergei Sadkov</h3>
                <p className="lp-role">CTO</p>
                <p>Worked with the National Bank of Kazakhstan on the digital tenge. Built and sold AutoOffice, a SaaS CRM with 200k+ users.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="lp-sec lp-final">
        <div className="lp-wrap">
          <h2>Next step: one pilot bond issue with KASE</h2>
          <p className="lp-lead">Test PriTok on a single issue and measure what it saves the operator, the issuer and investors.</p>
          <div className="lp-ctas center">
            <a className="lp-btn" href={DEMO}>Open the live demo</a>
            <a className="lp-btn ghost" href={CODE}>Read the code</a>
          </div>
        </div>
      </section>

      <footer className="lp-foot">
        <div className="lp-wrap">
          PriTok = <b>PRI</b>ncipal + <b>TOK</b>ens · "pritok" is Russian for "inflow". Devnet prototype: test tokens, no real
          money.
        </div>
      </footer>
    </div>
  );
}
