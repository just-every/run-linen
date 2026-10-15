// Paid provider boundary only: auth still issues and consumes its real proofs.
export const mailEdge = `
const sentMail = [];
const providerFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
 const request = new Request(input, init);
 if (new URL(request.url).hostname !== 'api.resend.com') return providerFetch(input, init);
 sentMail.push(await request.json());
 return Response.json({id: crypto.randomUUID()});
};
function mailFixture(request) {
 if (new URL(request.url).pathname !== '/fixtures/mail') return null;
 const message = sentMail.at(-1);
 return new Response(message ? (message.html ?? '') + (message.text ?? '') : '', {headers:{'content-type':'text/plain'}});
}
`;
