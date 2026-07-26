# Product feedback

- When a customer-facing fallback is technically correct but the requested primary
  experience is map pinning, verify the deployed Maps key before presenting the
  fallback as a finished UX. Keep the typed-address fallback for outages, but make
  the missing billing/key/API configuration explicit and unblock the map first.

- Do not report a map feature as working from a successful code deployment alone.
  Confirm the production bundle contains a configured browser key and exercise the
  delivery-location modal before claiming the customer path is restored.

- When a product subtype has a fixed business option, constrain the visible choices
  and set the only valid value automatically so the saved order cannot omit it.
