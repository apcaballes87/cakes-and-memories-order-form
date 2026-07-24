# Order Form Reliability and Maps Recovery

- [x] Verify current Supabase guidance, live schemas, deployed function sources, and rollout guards.
- [x] Implement unified form validation, visible invalid-submit handling, and conditional-field cleanup.
- [x] Add bounded image processing/uploads, submission stages, retryable errors, and attempt IDs.
- [x] Normalize UUID/PSID route identity and stop locking unpaid prefilled Credit Card links.
- [x] Implement manual-address fallback, nullable coordinates, resilient Maps loading, and responsive modal behavior.
- [x] Prepare additive idempotency/payment-state migrations and server-owned submission/payment functions.
- [x] Add deployment source/project guards and keep RLS/storage revocation gated until consumer verification.
- [x] Add browser/app typechecks, unit tests, browser tests, and focused reliability scenarios.
- [x] Run build, typecheck, tests, diff checks, browser verification, and live-state read-only checks.
- [ ] Enable the rotated Google Maps browser key in Vercel, then verify map pinning in production and begin the 48-hour Phase 1 observation.

## Review

- Completed locally: app/function typechecks, production build, 13 unit/component tests,
  Playwright desktop/mobile validation, short viewport/manual-address recovery, and
  offline upload recovery. `scripts/deploy-order-form-functions.sh --check` confirmed
  the Cake App project and live v26/v24 source baseline.
- The verified Phase 1 build is now live on Vercel. Its bundled client has no Google
  Maps browser key, so it correctly enters manual-address fallback instead of showing
  a broken map. Map pinning remains blocked until a newly rotated restricted key is
  configured with billing and the required Google Maps APIs, followed by a rebuild.
- Deferred intentionally: Maps key rotation/API enablement and its 48-hour observation,
  Phase 2 migration/function deployment, client feature-flag activation, and RLS/storage
  revocation. These require the prescribed production rollout gate and must not be
  activated together.
