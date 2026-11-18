import Link from "next/link";
import {
  PublicHeader,
  PublicFooter,
  HowItWorksPanel,
} from "@/components/public-page-chrome";
import { CopyTextButton } from "@/components/copy-text-button";
import { AiAccessFaq } from "@/components/ai-access-faq";
import { Button } from "@/components/ui/button";
import {
  MovingDrawing,
  MovingAccount,
} from "@/components/landing/moving-drawings";
import {
  MovingParts,
  MovingKeeps,
  IdeasButton,
  MovingQuestions,
} from "@/components/landing/moving-interactions";
import { movingFaqs } from "@/components/landing/moving-faq";
import "./home-drawn.css";

const starterPrompt =
  "Open movingmanifest.com/ai and help me set up Assist With Moving. Start with my move context, places, decisions, and what needs attention. Connect to movingmanifest.com/mcp with OAuth, call get_move_brief first, search before creating duplicates, and save finished work with save_complete_result.";

export default function MarketingPage() {
  return (
    <main className="moving-home min-h-screen bg-background text-foreground">
      <PublicHeader />
      <div className="moving-width">
        <section className="moving-hero">
          <div>
            <h1>Keep the whole move coherent.</h1>
            <p className="moving-lede">
              Your AI is good at helping you plan a household move. This site
              gives it an extended, detailed memory and additional tools.
            </p>
            <p>
              One durable workspace for the changing plan, places, decisions,
              belongings, evidence, and handoffs you share with your chosen AI.
              Start simply, then add detail only when the move needs it.
            </p>
            <div className="moving-actions">
              <Button asChild size="touch">
                <Link href="/sign-up">Get started</Link>
              </Button>
              <Button asChild size="touch" variant="outline">
                <a href="#connect">How to connect</a>
              </Button>
            </div>
            <p className="moving-status">
              Active development · Start with your home move.
            </p>
          </div>
          <div>
            <MovingDrawing />
            <p className="moving-caption">
              Assist your AI, so it can assist you with moving.
            </p>
          </div>
        </section>
        <section className="moving-section">
          <h2>With the right data, your AI is even more helpful</h2>
          <p className="moving-lede">Pick any part of your move.</p>
          <p>Assist you and your AI with every part of your move.</p>
          <MovingParts />
          <MovingKeeps />
        </section>
        <div className="moving-freedom-faq moving-section">
          <section>
            <h2>Freedom to change AI tools</h2>
            <p className="moving-lede">AI models change. Your data stays.</p>
            <p>
              Keep the move record here and connect your chosen AI to the
              context you allow it to use.
            </p>
            <MovingAccount />
            <dl className="moving-facts">
              <div>
                <dt>Switch whenever you like</dt>
                <dd>
                  Bring the assistant you choose. Each app connects its own way.
                </dd>
              </div>
              <div>
                <dt>Nothing to rebuild</dt>
                <dd>
                  Your saved move record stays here when you change AI tools.
                </dd>
              </div>
              <div>
                <dt>Yours to take</dt>
                <dd>
                  Export a full owner packet for yourself, or a scoped packet
                  for someone else.
                </dd>
              </div>
            </dl>
            <details>
              <summary>You, your AI, and this site</summary>
              <p>
                You decide what to work on. Your AI helps research and organize.
                Moving keeps the context and results, and controls access to its
                own tools and data. Your AI’s work outside Moving stays in its
                own environment.
              </p>
              <HowItWorksPanel />
            </details>
            <details>
              <summary>One room, then the next · an example</summary>
              <p>
                Start with two places, a few boxes and one vehicle. Ask your AI
                to help organize a room, then save the result. Return to that
                context when it is time to pack or prepare a mover packet. This
                is an illustration, not a live move.
              </p>
            </details>
            <IdeasButton />
            <div className="moving-reading">
              <Link href="/pcs-moving">PCS moving →</Link>
              <Link href="/claims-inventory">Claims inventory →</Link>
            </div>
          </section>
          <section>
            <h2>Questions before you start</h2>
            <MovingQuestions>
              <div id="moving-faq-list">
                {movingFaqs.map((faq) => (
                  <details key={faq.question}>
                    <summary>{faq.question}</summary>
                    <div className="moving-answer">{faq.answer}</div>
                  </details>
                ))}
              </div>
            </MovingQuestions>
            <details>
              <summary>How can I limit my AI’s access?</summary>
              <AiAccessFaq />
            </details>
          </section>
        </div>
        <section id="connect" className="moving-connect">
          <div>
            <h2>Connect your AI</h2>
            <p>
              Each AI app connects its own way. Start with the setup guide for
              your chosen assistant.
            </p>
            <div className="moving-actions">
              <Button asChild size="touch" variant="secondary">
                <Link href="/ai">Set up your chosen AI →</Link>
              </Button>
            </div>
            <p>
              AI reading this page? Start with <a href="/ai.txt">/ai.txt</a>.
            </p>
          </div>
          <MovingDrawing kind="connect" />
        </section>
        <details className="moving-prompt">
          <summary>Copy a prompt for your AI</summary>
          <p>
            Let’s get your AI set up on this:{" "}
            <a href="https://movingmanifest.com/ai">movingmanifest.com/ai</a>
          </p>
          <blockquote>{starterPrompt}</blockquote>
          <CopyTextButton
            text={starterPrompt}
            label="Copy prompt"
            ariaLabel="Copy the setup prompt"
            className="mt-4 min-h-11"
          />
        </details>
        <nav className="moving-reading" aria-label="Learn about the project">
          <Link href="/about">About →</Link>
          <Link href="/faq">FAQ →</Link>
          <Link href="/features">Features →</Link>
        </nav>
      </div>
      <PublicFooter />
    </main>
  );
}
