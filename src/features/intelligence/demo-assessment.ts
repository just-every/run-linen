interface IntakeContext {
  title: string;
  messages: { body: string }[];
  catalog: { id: string; name: string; kind: string; target: string }[];
  services: { id: string; name: string; description: string }[];
}

const calendarWord = /^(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|January|February|March|April|May|June|July|August|September|October|November|December|Today|Tomorrow)$/;
/** The person the request's words are about: a name that opens it ("Wes Calloway in Sales starts…", "Priya needs…")
    or follows "for" ("a seat for Priya"). Empty when the words name no one, as a request for oneself reads. */
function requestedPerson(words: string) {
  const subject = words.match(/^([A-Z][a-z]+(?: [A-Z][a-z]+)?)\s+(?:in|from|at|on|needs|starts|joins|wants|requires|is|has|will|would)\b/)?.[1];
  const beneficiary = words.match(/\bfor ([A-Z][a-z]+(?: [A-Z][a-z]+)?)\b(?!['’])/)?.[1];
  return [subject, beneficiary].find(name => name && !calendarWord.test(name.split(' ')[0])) ?? '';
}

/** Provider output for the explicitly isolated demo, using only its supplied context. */
export function demoIntakeAssessment(input: IntakeContext) {
  const words = input.title + ' ' + input.messages.map(m => m.body).join(' '), text = words.toLowerCase();
  const catalog = input.catalog.find(c => text.includes(c.name.toLowerCase()))
    ?? input.catalog.find(c => c.name.includes('Figma') && /figma|design.*seat/.test(text))
    ?? input.catalog.find(c => c.name.includes('dashboard') && /dashboard|revenue report/.test(text))
    ?? input.catalog.find(c => c.name.includes('charger') && /charger/.test(text))
    ?? input.catalog.find(c => c.name.includes('archive') && /archive/.test(text))
    ?? input.catalog.find(c => c.name === 'Loan laptop' && /laptop/.test(text))
    ?? input.catalog.find(c => c.name.includes('mailbox') && /mailbox/.test(text));
  const common = { summary: '', catalogId: '', serviceId: '', purpose: input.title, expiresAt: null, question: '', requestedFor: requestedPerson(words), evidenceIds: [] };
  if (catalog && !/cannot|can't|disconnect|intermittent|timing out|slow|not working/.test(text))
    return { ...common, kind: 'catalog_request', catalogId: catalog.id, summary: `I’ve assessed this as a request for ${catalog.name}. Its fulfillment owner will coordinate the next step and any required decision.` };
  const service = input.services.find(s => s.name === 'Office connectivity' && /vpn|wi-fi|wifi|network/.test(text))
    ?? input.services.find(s => s.name === 'Business reporting' && /export|invoice|report|dashboard/.test(text))
    ?? input.services.find(s => s.name === 'Team collaboration' && /camera|meeting|mail|workspace/.test(text));
  if (service) return { ...common, kind: 'investigation', serviceId: service.id, summary: `I’ve assessed the affected service as ${service.name} and routed the request to its service owner.` };
  return { ...common, kind: 'necessary_question', summary: 'Your request has been assessed.', question: 'Which application, device or service do you need help with, and what outcome do you need?' };
}

/** The OpenAI success envelope; all consumers still validate the schema and evidence IDs. */
export function demoModelResponse(input: { purpose: string; demoValue?: () => unknown }, packet: { evidenceIds: string[]; commitment: { availableProbes: { id: string }[] } | null }) {
  let value: unknown;
  if (input.demoValue) value = input.demoValue();
  else if (input.purpose === 'natural_language_intake') value = {
    kind: 'proposed_plan', summary: 'Review the affected service and coordinate the next step with its owner.',
    steps: ['Confirm the requested outcome and affected people.', 'Check current evidence and authority before making a change.'], question: '', evidenceIds: packet.evidenceIds,
  };
  else if (['atomic_breach_decision', 'direct_capable_model_decision'].includes(input.purpose)) value = {
    decision: 'investigate', reason: 'Compare the current observations before choosing a repair.', evidenceIds: packet.evidenceIds,
  };
  else if (input.purpose === 'rival_hypothesis_research') value = {
    hypotheses: [
      { id: 'service', explanation: 'The affected service may be degraded.', prediction: 'The scoped service probe will show a failure.', status: 'open', evidenceIds: packet.evidenceIds },
      { id: 'access', explanation: 'The problem may be limited to the affected user’s access.', prediction: 'The service probe will pass while the affected workflow fails.', status: 'open', evidenceIds: packet.evidenceIds },
    ],
    probes: (packet.commitment?.availableProbes ?? []).map(p => ({ probeId: p.id, hypothesisIds: ['service', 'access'], predictedObservation: 'Check the affected workflow.', discriminatesBecause: 'Separates a shared service fault from a user-specific access problem.' })),
    rejectedExplanations: [], missingEngineering: [], conclusion: 'Compare the scoped observations before proposing a repair.',
    next: packet.commitment?.availableProbes.length ? 'probe' : 'unresolved', evidenceIds: packet.evidenceIds,
  };
  else throw new Error('Unknown demo model purpose: ' + input.purpose);
  return Response.json({
    id: 'demo_' + crypto.randomUUID(), status: 'completed',
    output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(value) }] }],
    usage: { input_tokens: 300, output_tokens: 100, total_tokens: 400 },
  }, { headers: { 'x-request-id': 'demo_' + crypto.randomUUID() } });
}
