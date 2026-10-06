// Retired arbitrary-recipient/text browser API. Confirmations are queued by
// authoritative order transitions and sent by the internal Zernio worker.
Deno.serve(() => new Response(JSON.stringify({ error: 'Messenger confirmations are server-owned.' }), {
  status: 410, headers: { 'Content-Type': 'application/json' },
}))
