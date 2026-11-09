import policy from "../../shared/ai-connection-policy.json";
export function AiAccessFaq() { return <section className="mx-auto max-w-7xl px-4 py-10 sm:px-6"><h2 className="text-2xl font-semibold">{policy.question}</h2><p className="mt-3 max-w-3xl leading-7">{policy.answer}</p><a className="mt-3 inline-block underline" href="/settings/ai">Settings → AI</a></section>; }
