# Customer boundary rollout — prepared, not deployed

Project: Cakes & Memories `congofivupobtfudnhni`. Keep Messenger shadow and current live/legacy verification gates unchanged. No provider POST or customer send was performed while preparing this change.

## Source behavior

- Lowercase `candle2`/`candle3` prefill with uppercase fallback. Unknown Messenger quantities render blank and require customer input; legacy defaults remain one.
- Server mode (`VITE_ORDER_SUBMISSION_API=server`) replaces final-order browser lookup and legacy PRE fallback with exactly-one-capability status RPC. Missing UUID stays unavailable. Existing pending card payment resumes its URL; uncertain creation asks for reconciliation.
- Submission derives recipient, branch and agreed card price from PRE. Browser payment/hold/copied/order-number state is discarded. Random UUID order capability locks one canonical submission across different attempt IDs and direct/card modes.
- Persistent invoice creation compare-and-set occurs before the provider POST. Concurrent or uncertain attempts reconcile the deterministic external ID; they never blindly create another invoice. A provider rejection without a recoverable invoice stays uncertain and requires staff review; resetting ownership needs provider evidence.
- Authoritative final/pending insert triggers queue fixed confirmation templates. The internal worker validates its dedicated secret and current live/verified/legacy gates, claims each row once, and records ambiguous sends as uncertain. It excludes stale payment-pending confirmations after completion. Browser arbitrary-message source returns 410.

## Prerequisites and compatibility inventory

The July reliability migration, `submit-order`, and its RPCs were absent in the inspected live project. Apply the existing additive reliability migration before the new capability migration in a disposable staging database; validate against the exact live table schema. The reliability and capability SQL were applied to an isolated PostgreSQL-compatible fixture built from live column types; they were not executed against production.

Callers found by source audit:

| Caller | Required coordination before global access cutoff |
| --- | --- |
| Cebu `pages/OrderForm.tsx` | Deploy backend, then enable server mode and verify UUID/default/legacy route behavior. |
| Molino `pages/OrderForm.tsx:209` | Replace direct final-order lookup and audit its submission APIs; deploy capability boundary appropriate to Molino. |
| Order-list `useOrders.ts`, `useNotifications.ts` | Verify authenticated staff roster includes every intended user; test list, edit, copy, delete, notification flows. |
| Cakes-and-Memories-web equivalent order/notification hooks | Same staff authorization and integration tests; do not assume all authenticated accounts are staff. |
| Legacy order-list `verify-xendit-payment` | New verifier adapts legacy payments through an invoice-locked atomic RPC. It reuses a matching final UUID order, otherwise migrates the pending invoice into reliable finalization. Already-paid legacy payments lacking a UUID/final pointer remain manual review because identity cannot safely be inferred. Controlled legacy-paid integration acceptance still required. |
| External Make/n8n integrations and live Edge Functions | Inspect deployed callers/keys separately; source inventory cannot establish their absence. Service-role callers remain supported by final RLS. |
| `send-messenger-message` | Source caller found in Cebu only. External callers still require inventory; retire endpoint only after their fixed-template alternatives are verified. |

No other final-table/arbitrary-sender calls were found in the scanned app, Shopify app, or Genie admin directories; this is a local source inventory, not proof about deployed/external systems.

The scoped final-row protection migration enables RLS but leaves existing non-Messenger rows available to legacy consumers; session-owned Messenger rows require staff membership or exactly-one-order capability server access. It removes destructive TRUNCATE grants for every public role. This is an interim boundary, not remediation of the broad legacy access finding. The staged full cutoff removes that legacy policy.

## Deployment order

1. Stage the reliability and both new migrations in an isolated database with live-schema-compatible fixtures. Verify SQL atomicity under simultaneous direct/card submissions, different attempt IDs, final insert retries, missing/legacy UUID and pending legacy invoice cases. Check PRE customer-open protection and final/session/outbox transition rollback.
2. Deploy submission/upload endpoints and the confirmation worker with `ORDER_CONFIRMATION_WORKER_SECRET`, `ZERNIO_API_KEY`, existing Supabase service-role/Xendit server secrets. Integrate worker POST into the existing dashboard Messenger cron with its dedicated bearer secret; use ORDER_CONFIRMATION_WORKER_SECRET or copy the existing MESSENGER_WORKER_SECRET to the Edge environment. Deploy the upgraded legacy-aware verifier only after old and new invoice fixtures pass. Backend functions need capability-based public entry access; worker uses its own secret, not public browser JWT authorization.
3. Verify endpoint payload/errors and status under anon role, then release frontend server flag. Test real form direct save and controlled sandbox card acceptance/timeout/reload; no live customer payment during rollout testing.
4. Migrate Molino and validate staff membership/access. Only then execute `supabase/cutover/final-order-access.sql`, explicitly setting its session readiness gate inside the transaction. This staged file is deliberately not an automatically applied migration. Validate anon cannot list/write/delete/truncate final orders; correct capability reveals only one order summary/draft; staff and service payment flows remain functional.
5. Retire legacy arbitrary-message endpoint after caller signoff. Test worker in shadow produces zero provider calls, then controlled Zernio confirmation acceptance separately from delivery before any live cutover.

Rollback frontend server mode only before final access cutoff. After cutoff, retain server endpoints and database intents; rolling back to public grants is not the default. Pause sending independently, preserving queued/uncertain rows and payment intents.

## Local verification results

- `npm ci` used the locked dependency tree; no application dependencies changed.
- App/function typechecks, production build and the complete Vitest suite pass.
- SQL fixture applies the existing reliability migration plus both new migrations and exercises scoped RLS, staff/nonstaff access, legacy payment finalization, order reuse, invoice claims and confirmation shadow/exclusive claims.
- Fixed-template/shadow worker tests mock network transport only. No paid provider request, customer send, production migration, commit or push was performed.

## Verification boundary

Focused form and mocked server tests/typecheck/build validate local source only. Provider acceptance, SQL integration/concurrency, staff browser access, and legacy payment adapter remain deployment prerequisites. Do not claim these as live verified. The capability SQL must be reviewed with the exact deployed schema before application; no migration or access policy was applied during this task.


## Reproduce the isolated SQL checks

Install the test-only runtime outside the repository (does not change the app lockfile):

```sh
npm install --prefix /tmp/cebu-boundary-sql-check --no-package-lock @electric-sql/pglite
node scripts/verify-order-boundary.mjs
```

Set `PGLITE_PACKAGE_DIR` to another installation directory if needed. The fixture records live table column types only; it contains no orders, personal data or secrets. It validates migration compilation, canonical attempt reuse, direct/card conflict, invoice creation CAS, direct insertion retry, legacy authoritative paid finalization/retry, capability status, and anonymous scoped RLS. Exact production defaults/triggers and parallel network timing require staging acceptance separately.
