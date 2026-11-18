import Link from "next/link";
import { supportDesk, supportDeskUrl } from "@/lib/support";

// Each FAQ is a question + the honest answer body. Answers may include
// inline links (rendered as React nodes) so we keep `answer` as ReactNode.
type Faq = {
  question: string;
  answer: React.ReactNode;
};

export const movingFaqs: Faq[] = [
  {
    question: "What is Assist With Moving?",
    answer: (
      <>
        Assist With Moving is a structured system of record for a move. You
        catalog your inventory, pack and label boxes with their contents, attach
        photo evidence, plan how everything loads onto trucks, vehicles,
        storage, or movers, and export scoped documentation packets when someone
        needs a copy. The goal is one organized record of your move instead of a
        pile of spreadsheets, photos, and sticky notes.
      </>
    ),
  },
  {
    question: "Do I need an account?",
    answer: (
      <>
        Not to learn about it. The public pages — like this one — are readable
        without signing in. You only need an account once you want to save real
        move data: your inventory, boxes, photos, and packets live in your own
        private workspace.
      </>
    ),
  },
  {
    question: "Is my move data private?",
    answer: (
      <>
        Yes, by default. Your original photos and full records stay private to
        you. When you generate a packet for someone else, it is scoped to that
        recipient — values, serial numbers, private notes, and sensitive photos
        stay hidden unless you choose to share them. Different kinds of access
        (your signed-in sessions, API keys you create, and share links) are kept
        on separate paths, so handing someone one does not hand over the others.
      </>
    ),
  },
  {
    question: "How does the AI assistant part work?",
    answer: (
      <>
        You bring your own assistant — Claude, ChatGPT, Codex, or another tool
        you already use. Assist With Moving does not bundle its own AI. You
        connect your assistant either through hosted MCP OAuth or with a scoped
        API key you create yourself and can revoke at any time. The product is
        the structured place your assistant reads from and writes to. See the{" "}
        <Link
          href="/ai"
          className="text-primary underline-offset-4 hover:underline"
        >
          AI assistants
        </Link>{" "}
        and{" "}
        <Link
          href="/mcp"
          className="text-primary underline-offset-4 hover:underline"
        >
          MCP
        </Link>{" "}
        pages for the details.
      </>
    ),
  },
  {
    question: "Will the AI change my stuff automatically?",
    answer: (
      <>
        Your connected AI can save the work you request directly. You can review
        its activity and limit its access in Settings → AI or by asking it. Any
        review step you have chosen for individual records still applies.
      </>
    ),
  },
  {
    question: "Can I use it for a military PCS?",
    answer: (
      <>
        Yes. Assist With Moving supports a mixed move with household goods
        (HHG), personally procured (PPM) portions, and personal-transport
        planning, and it can produce PCS-focused packets. Official fields are
        configurable rather than hardcoded to one policy. It is an organizing
        tool, not an official authority — always verify requirements with your
        transportation office.
      </>
    ),
  },
  {
    question: "What can I export?",
    answer: (
      <>
        Documentation packets, scoped to whoever receives them: a mover packet,
        an employer relocation packet, an insurance or claim packet, a PCS
        packet, a donation packet, a storage packet, or a full owner packet for
        yourself. Each one only shows the fields appropriate for that recipient.
      </>
    ),
  },
  {
    question: "How much does it cost?",
    answer: (
      <>
        Assist With Moving is in active development / early access, and pricing
        is not yet announced. We are not stating a price here because there is
        not a confirmed one to share yet.
      </>
    ),
  },
  {
    question: "How do I get help or report a problem?",
    answer: (
      <>
        Check the{" "}
        <a
          href={supportDeskUrl("home")}
          className="text-foreground underline underline-offset-4 hover:text-primary"
        >
          {supportDesk.name}
        </a>
        . It shows the current intake status for the whole family. When intake
        is open, use it for questions, bug reports, or privacy requests about
        your move. When intake is closed, the desk cannot accept or save
        requests. There is no support email address, and none is planned —
        Assist With Moving does not run a mailbox.
      </>
    ),
  },
  {
    question:
      "Is Assist With Moving affiliated with the military, insurers, or moving companies?",
    answer: (
      <>
        No. Assist With Moving is an independent organizing tool. It is not an
        official authority and has no affiliation with the military, the
        Department of Defense, insurers, moving companies, or any government
        office. It does not decide whether a claim is paid, whether an insurer
        or office approves anything, or whether a move meets any policy — it
        just helps you keep your move organized and documented.
      </>
    ),
  },
];
