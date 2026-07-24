import {
  createClient,
  type SupabaseClient,
} from 'https://esm.sh/@supabase/supabase-js@2.75.1'

export const CAKE_APP_PROJECT_REF = 'congofivupobtfudnhni'
export const ORDER_FORM_SOURCE_REVISION = 'order-form-phase2-20260724'
export const ORDER_ASSET_BUCKET = 'order-form-assets'

const MAX_UPLOAD_BYTES = 3 * 1024 * 1024
// The current form supports five images for each of three products plus one
// optional payment screenshot.
const MAX_UPLOAD_FILES = 16
const DEFAULT_ORIGIN = 'https://cakes-and-memories-order-form.vercel.app'
const ZERO_UUID = '00000000-0000-0000-0000-000000000000'

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const SUBSCRIBER_ID_PATTERN = /^\d{5,32}$/
const RELEASE_SHA_PATTERN = /^[a-f0-9]{7,64}$/i

const ORDER_COLUMNS = new Set([
  'facebookname',
  'Name',
  'contact',
  'Addres',
  'latitude',
  'longitude',
  'receiverName',
  'receiverContact',
  'DateOrdered',
  'DateEvent',
  'TimeEvent',
  'paymentOption',
  'Comment',
  'orderNumber',
  'numberproducts',
  'branch',
  'payment',
  'copiedToList',
  'hold',
  'manychatlink',
  'Product1',
  'code1',
  'Message1',
  'details1',
  'quantity1',
  'Price1',
  'Candle',
  'orderLink',
  'Product2',
  'code2',
  'message2',
  'details2',
  'quantity2',
  'price2',
  'candle2',
  'pic2',
  'product3',
  'code3',
  'message3',
  'details3',
  'qty3',
  'candle3',
  'pic3',
  'facebookU',
  'subscriberid',
])

const MIME_EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}

export type RouteKind = 'default' | 'facebook_uuid' | 'subscriber_psid'
export type PaymentMode = 'direct' | 'xendit'
export type EventStage =
  | 'validation'
  | 'upload'
  | 'save'
  | 'payment'
  | 'completion'

export interface RouteIdentity {
  kind: RouteKind
  facebookU?: string
  subscriberId?: string
}

export interface AssetReference {
  bucket: string
  path: string
  kind: 'product' | 'payment_screenshot'
}

export interface SubmissionRequest {
  submissionId: string
  routeIdentity: RouteIdentity
  orderData: Record<string, unknown>
  assets: AssetReference[]
  payment: {
    mode: PaymentMode
    amount?: number
  }
  customer?: {
    name?: string
    email?: string
  }
  releaseSha?: string
}

export interface NormalizedSubmission extends SubmissionRequest {
  orderData: Record<string, unknown>
  assets: AssetReference[]
  payment: {
    mode: PaymentMode
    amount?: number
  }
  preorderFacebookU: string | null
  paymentUserId: string
  requestFingerprint: string
}

export interface UploadFileRequest {
  kind: 'product' | 'payment_screenshot'
  contentType: keyof typeof MIME_EXTENSIONS
  size: number
}

export interface XenditInvoice {
  id: string
  external_id: string
  status: string
  amount: number
  invoice_url?: string
  expiry_date?: string
  paid_amount?: number
  paid_at?: string
  payment_method?: string
  payment_channel?: string
}

interface PreparedSubmission {
  pending_order_id: string | null
  final_order_id: number | null
  final_order_number: string | null
  created: boolean
}

export interface RecordedPayment {
  id: string
  order_id: string
  xendit_invoice_id: string
  xendit_external_id: string
  status: string
  amount: number
  payment_link_url: string | null
  final_order_id: number | null
  submission_id: string
}

type AdminClient = SupabaseClient<any>

export class ContractError extends Error {
  readonly code: string
  readonly status: number
  readonly retryable: boolean

  constructor(
    code: string,
    message: string,
    status = 400,
    retryable = false,
  ) {
    super(message)
    this.name = 'ContractError'
    this.code = code
    this.status = status
    this.retryable = retryable
  }
}

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value)
}

export function newAttemptId(): string {
  return crypto.randomUUID()
}

export function createAdminClient(): AdminClient {
  assertRuntimeProject()

  const url = Deno.env.get('SUPABASE_URL') ?? ''
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

  if (!url || !serviceRoleKey) {
    throw new ContractError(
      'SERVER_CONFIGURATION_ERROR',
      'The order service is temporarily unavailable.',
      503,
      true,
    )
  }

  return createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }) as AdminClient
}

export function assertRuntimeProject(): void {
  const url = Deno.env.get('SUPABASE_URL') ?? ''
  let hostname = ''

  try {
    hostname = new URL(url).hostname
  } catch {
    // The missing/malformed URL is reported by createAdminClient.
  }

  if (
    hostname &&
    hostname !== `${CAKE_APP_PROJECT_REF}.supabase.co` &&
    hostname !== 'host.docker.internal' &&
    hostname !== 'kong' &&
    hostname !== 'supabase_kong' &&
    hostname !== 'localhost' &&
    hostname !== '127.0.0.1'
  ) {
    throw new ContractError(
      'WRONG_SUPABASE_PROJECT',
      'The order service is not configured for the Cake App project.',
      503,
      false,
    )
  }
}

export function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('origin')
  const allowedOrigin = origin && isAllowedOrigin(origin) ? origin : DEFAULT_ORIGIN

  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers':
      'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
    'Vary': 'Origin',
  }
}

export function jsonResponse(
  req: Request,
  body: Record<string, unknown>,
  status = 200,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: corsHeaders(req),
  })
}

export function errorResponse(
  req: Request,
  error: unknown,
  attemptId: string,
  submissionId?: string,
): Response {
  const normalized = normalizeError(error)

  console.error(
    JSON.stringify({
      component: 'order_submission',
      sourceRevision: ORDER_FORM_SOURCE_REVISION,
      attemptId,
      submissionId: isUuid(submissionId) ? submissionId : undefined,
      errorCode: normalized.code,
      retryable: normalized.retryable,
    }),
  )

  return jsonResponse(
    req,
    {
      kind: 'retryable_error',
      submissionId: isUuid(submissionId) ? submissionId : undefined,
      attemptId,
      code: normalized.code,
      message: normalized.message,
      retryable: normalized.retryable,
    },
    normalized.status,
  )
}

export function parseSubmissionRequest(
  raw: unknown,
  forcedPaymentMode?: PaymentMode,
): Promise<NormalizedSubmission> {
  return normalizeSubmission(raw, forcedPaymentMode)
}

async function normalizeSubmission(
  raw: unknown,
  forcedPaymentMode?: PaymentMode,
): Promise<NormalizedSubmission> {
  if (!isRecord(raw)) {
    throw new ContractError(
      'INVALID_REQUEST',
      'The order request is invalid.',
      400,
      false,
    )
  }

  const submissionId = raw.submissionId
  if (!isUuid(submissionId)) {
    throw new ContractError(
      'SUBMISSION_ID_REQUIRED',
      'Please retry the order from the form.',
      400,
      false,
    )
  }

  const routeIdentity = normalizeRouteIdentity(
    raw.routeIdentity,
    isRecord(raw.orderData) ? raw.orderData : {},
  )
  const orderData = normalizeOrderData(raw.orderData, routeIdentity)
  const assets = normalizeAssets(raw.assets, submissionId)

  const paymentValue = isRecord(raw.payment) ? raw.payment : {}
  const mode = forcedPaymentMode ?? paymentValue.mode
  if (mode !== 'direct' && mode !== 'xendit') {
    throw new ContractError(
      'PAYMENT_MODE_INVALID',
      'Please select a valid payment option.',
      400,
      false,
    )
  }

  const amountValue = paymentValue.amount ?? raw.amount
  const amount =
    typeof amountValue === 'number'
      ? amountValue
      : typeof amountValue === 'string' && amountValue.trim()
        ? Number(amountValue)
        : undefined

  if (
    mode === 'xendit' &&
    (!Number.isFinite(amount) || (amount as number) <= 0)
  ) {
    throw new ContractError(
      'PAYMENT_AMOUNT_INVALID',
      'The payment amount is invalid. Please contact support.',
      400,
      false,
    )
  }

  const customer = normalizeCustomer(raw.customer, orderData)
  const releaseSha =
    typeof raw.releaseSha === 'string' && RELEASE_SHA_PATTERN.test(raw.releaseSha)
      ? raw.releaseSha
      : undefined
  const preorderFacebookU =
    routeIdentity.kind === 'facebook_uuid'
      ? routeIdentity.facebookU ?? null
      : null

  const fingerprintOrderData = { ...orderData }
  delete fingerprintOrderData.DateOrdered

  const fingerprintInput = {
    submissionId,
    routeKind: routeIdentity.kind,
    orderData: fingerprintOrderData,
    assets,
    payment: {
      mode,
      amount: mode === 'xendit' ? amount : undefined,
    },
  }
  const requestFingerprint = await sha256Hex(
    canonicalStringify(fingerprintInput),
  )

  return {
    submissionId,
    routeIdentity,
    orderData,
    assets,
    payment: {
      mode,
      amount: mode === 'xendit' ? amount : undefined,
    },
    customer,
    releaseSha,
    preorderFacebookU,
    paymentUserId: preorderFacebookU ?? ZERO_UUID,
    requestFingerprint,
  }
}

export async function executeSubmission(
  req: Request,
  submission: NormalizedSubmission,
  attemptId: string,
  admin: AdminClient,
): Promise<Record<string, unknown>> {
  await recordEvent(admin, {
    submissionId: submission.submissionId,
    attemptId,
    stage: 'validation',
    eventName: 'server_validation_passed',
    routeKind: submission.routeIdentity.kind,
    itemCount: getProductCount(submission.orderData),
    releaseSha: submission.releaseSha,
  })

  if (submission.payment.mode === 'direct') {
    const startedAt = Date.now()
    const { data, error } = await admin.rpc('create_order_from_submission', {
      p_submission_id: submission.submissionId,
      p_order_data: submission.orderData,
      p_preorder_facebook_u: submission.preorderFacebookU,
    })

    if (error) {
      throw rpcContractError(error)
    }

    const order = firstRow<{
      order_id: number
      order_number: string | null
      created: boolean
    }>(data)

    if (!order?.order_id) {
      throw new ContractError(
        'ORDER_SAVE_FAILED',
        'We could not save the order. Please try again.',
        503,
        true,
      )
    }

    await recordEvent(admin, {
      submissionId: submission.submissionId,
      attemptId,
      stage: 'save',
      eventName: order.created ? 'order_created' : 'order_reused',
      routeKind: submission.routeIdentity.kind,
      durationMs: Date.now() - startedAt,
      releaseSha: submission.releaseSha,
    })
    await recordEvent(admin, {
      submissionId: submission.submissionId,
      attemptId,
      stage: 'completion',
      eventName: 'submission_completed',
      routeKind: submission.routeIdentity.kind,
      releaseSha: submission.releaseSha,
    })

    return {
      kind: 'order_created',
      submissionId: submission.submissionId,
      attemptId,
      orderId: order.order_id,
      orderNumber: order.order_number,
    }
  }

  return await createOrReuseXenditPayment(
    req,
    submission,
    attemptId,
    admin,
  )
}

export async function createOrReuseXenditPayment(
  req: Request,
  submission: NormalizedSubmission,
  attemptId: string,
  admin: AdminClient,
): Promise<Record<string, unknown>> {
  const startedAt = Date.now()
  const existingPayment = await findPaymentBySubmission(
    admin,
    submission.submissionId,
  )

  if (existingPayment) {
    return await responseForExistingPayment(
      admin,
      submission,
      attemptId,
      existingPayment,
      Date.now() - startedAt,
    )
  }

  const { data: preparedData, error: prepareError } = await admin.rpc(
    'prepare_xendit_submission',
    {
      p_submission_id: submission.submissionId,
      p_order_data: submission.orderData,
      p_request_fingerprint: submission.requestFingerprint,
      p_preorder_facebook_u: submission.preorderFacebookU,
      p_route_kind: submission.routeIdentity.kind,
    },
  )

  if (prepareError) {
    throw rpcContractError(prepareError)
  }

  const prepared = firstRow<PreparedSubmission>(preparedData)
  if (prepared?.final_order_id) {
    return {
      kind: 'order_created',
      submissionId: submission.submissionId,
      attemptId,
      orderId: prepared.final_order_id,
      orderNumber: prepared.final_order_number,
    }
  }

  if (!prepared?.pending_order_id) {
    throw new ContractError(
      'PENDING_ORDER_FAILED',
      'We could not prepare the payment. Please try again.',
      503,
      true,
    )
  }

  const externalId = `order-form-${submission.submissionId}`
  let invoice = await findXenditInvoiceByExternalId(externalId)
  let recoveredExistingInvoice = Boolean(invoice)

  if (!invoice) {
    try {
      invoice = await createXenditInvoice(
        req,
        submission,
        prepared.pending_order_id,
        externalId,
      )
    } catch (error) {
      // Xendit can accept the invoice and lose the response. Always try to
      // reconcile by the deterministic external ID before returning an error.
      invoice = await findXenditInvoiceByExternalId(externalId)
      if (!invoice) {
        throw error
      }
      recoveredExistingInvoice = true
    }
  }

  validateInvoice(invoice, externalId, submission.payment.amount as number)

  const { data: paymentData, error: recordError } = await admin.rpc(
    'record_xendit_invoice',
    {
      p_submission_id: submission.submissionId,
      p_pending_order_id: prepared.pending_order_id,
      p_attempt_id: attemptId,
      p_invoice_id: invoice.id,
      p_external_id: invoice.external_id,
      p_status: invoice.status,
      p_amount: invoice.amount,
      p_payment_url: invoice.invoice_url ?? null,
      p_expiry_date: invoice.expiry_date ?? null,
      p_user_id: submission.paymentUserId,
    },
  )

  if (recordError) {
    throw new ContractError(
      'PAYMENT_PERSISTENCE_PENDING',
      'The payment link was created, but confirmation is still syncing. Please retry with the same form.',
      503,
      true,
    )
  }

  const payment = firstRow<RecordedPayment>(paymentData)
  const paymentUrl = payment?.payment_link_url ?? invoice.invoice_url
  if (!paymentUrl) {
    throw new ContractError(
      'PAYMENT_URL_MISSING',
      'The payment provider did not return a payment link. Please try again.',
      503,
      true,
    )
  }

  await recordEvent(admin, {
    submissionId: submission.submissionId,
    attemptId,
    stage: 'payment',
    eventName: recoveredExistingInvoice
      ? 'payment_recovered'
      : 'payment_created',
    routeKind: submission.routeIdentity.kind,
    durationMs: Date.now() - startedAt,
    releaseSha: submission.releaseSha,
  })

  return {
    kind: 'payment_required',
    submissionId: submission.submissionId,
    attemptId,
    pendingOrderId: prepared.pending_order_id,
    invoiceId: invoice.id,
    paymentUrl,
  }
}

async function responseForExistingPayment(
  admin: AdminClient,
  submission: NormalizedSubmission,
  attemptId: string,
  payment: RecordedPayment,
  durationMs: number,
): Promise<Record<string, unknown>> {
  if (Number(payment.amount) !== Number(submission.payment.amount)) {
    throw new ContractError(
      'SUBMISSION_PAYLOAD_CONFLICT',
      'This retry no longer matches the original payment request.',
      409,
      false,
    )
  }

  if (payment.final_order_id) {
    const { data } = await admin
      .from('New Facebook Orders')
      .select('id, order_number_text')
      .eq('id', payment.final_order_id)
      .maybeSingle()

    return {
      kind: 'order_created',
      submissionId: submission.submissionId,
      attemptId,
      orderId: payment.final_order_id,
      orderNumber: data?.order_number_text ?? null,
    }
  }

  if (payment.status === 'PAID' || payment.status === 'SETTLED') {
    throw new ContractError(
      'PAYMENT_FINALIZATION_PENDING',
      'Your payment is confirmed and the order is still finalizing. Please retry shortly.',
      503,
      true,
    )
  }

  if (payment.status === 'EXPIRED' || payment.status === 'FAILED') {
    throw new ContractError(
      'PAYMENT_LINK_EXPIRED',
      'This payment link is no longer active. Please restart the order.',
      409,
      false,
    )
  }

  if (!payment.payment_link_url) {
    throw new ContractError(
      'PAYMENT_RECOVERY_PENDING',
      'The existing payment is still syncing. Please retry shortly.',
      503,
      true,
    )
  }

  await recordEvent(admin, {
    submissionId: submission.submissionId,
    attemptId,
    stage: 'payment',
    eventName: 'payment_reused',
    routeKind: submission.routeIdentity.kind,
    durationMs,
    releaseSha: submission.releaseSha,
  })

  return {
    kind: 'payment_required',
    submissionId: submission.submissionId,
    attemptId,
    pendingOrderId: payment.order_id,
    invoiceId: payment.xendit_invoice_id,
    paymentUrl: payment.payment_link_url,
  }
}

export async function findPaymentForVerification(
  admin: AdminClient,
  lookup: {
    submissionId?: string
    invoiceId?: string
    orderId?: string
  },
): Promise<RecordedPayment | null> {
  let query = admin
    .from('xendit_payments')
    .select(
      'id, order_id, xendit_invoice_id, xendit_external_id, status, amount, payment_link_url, final_order_id, submission_id',
    )

  if (lookup.submissionId) {
    query = query.eq('submission_id', lookup.submissionId)
  } else if (lookup.invoiceId) {
    query = query.eq('xendit_invoice_id', lookup.invoiceId)
  } else if (lookup.orderId) {
    query = query.eq('order_id', lookup.orderId)
  } else {
    throw new ContractError(
      'PAYMENT_LOOKUP_REQUIRED',
      'The payment reference is missing.',
      400,
      false,
    )
  }

  const { data, error } = await query.maybeSingle()
  if (error) {
    throw new ContractError(
      'PAYMENT_LOOKUP_FAILED',
      'We could not check the payment. Please try again.',
      503,
      true,
    )
  }

  return data as RecordedPayment | null
}

export async function fetchXenditInvoiceById(
  invoiceId: string,
): Promise<XenditInvoice> {
  const response = await xenditFetch(
    `https://api.xendit.co/v2/invoices/${encodeURIComponent(invoiceId)}`,
    { method: 'GET' },
  )

  if (!response.ok) {
    throw new ContractError(
      'PAYMENT_PROVIDER_UNAVAILABLE',
      'We could not confirm the payment provider status. Please try again.',
      503,
      true,
    )
  }

  return (await response.json()) as XenditInvoice
}

export function validateRecordedInvoice(
  invoice: XenditInvoice,
  payment: RecordedPayment,
): void {
  validateInvoice(
    invoice,
    payment.xendit_external_id,
    Number(payment.amount),
  )

  if (invoice.id !== payment.xendit_invoice_id) {
    throw new ContractError(
      'PAYMENT_REFERENCE_MISMATCH',
      'The payment reference did not match the order.',
      409,
      false,
    )
  }
}

export async function recordEvent(
  admin: AdminClient,
  event: {
    submissionId?: string
    attemptId: string
    stage: EventStage
    eventName: string
    routeKind?: RouteKind
    itemCount?: number
    durationMs?: number
    releaseSha?: string
    errorCode?: string
  },
): Promise<void> {
  try {
    const { error } = await admin.from('order_submission_events').insert({
      submission_id: isUuid(event.submissionId) ? event.submissionId : null,
      attempt_id: event.attemptId,
      stage: event.stage,
      event_name: event.eventName,
      route_kind: event.routeKind ?? null,
      item_count: event.itemCount ?? null,
      duration_ms: event.durationMs ?? null,
      release_sha: event.releaseSha ?? null,
      error_code: event.errorCode ?? null,
    })

    if (error) {
      throw error
    }
  } catch {
    // Telemetry must never block an order, and this log contains no PII.
    console.warn(
      JSON.stringify({
        component: 'order_submission_telemetry',
        sourceRevision: ORDER_FORM_SOURCE_REVISION,
        attemptId: event.attemptId,
        submissionId: isUuid(event.submissionId)
          ? event.submissionId
          : undefined,
        errorCode: 'TELEMETRY_WRITE_FAILED',
      }),
    )
  }
}

export function normalizeError(error: unknown): ContractError {
  if (error instanceof ContractError) {
    return error
  }

  return new ContractError(
    'ORDER_SERVICE_ERROR',
    'We could not process the order. Please try again.',
    503,
    true,
  )
}

export function isAllowedOrigin(origin: string): boolean {
  let parsed: URL
  try {
    parsed = new URL(origin)
  } catch {
    return false
  }

  const configured = (Deno.env.get('ORDER_FORM_ALLOWED_ORIGINS') ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)

  if (configured.includes(parsed.origin)) {
    return true
  }

  if (
    parsed.origin === DEFAULT_ORIGIN ||
    parsed.origin === 'http://localhost:3000' ||
    parsed.origin === 'http://localhost:3003' ||
    parsed.origin === 'http://localhost:5173'
  ) {
    return true
  }

  return (
    parsed.protocol === 'https:' &&
    parsed.hostname.endsWith('.vercel.app')
  )
}

function normalizeRouteIdentity(
  raw: unknown,
  orderData: Record<string, unknown>,
): RouteIdentity {
  const value = isRecord(raw) ? raw : {}
  let kind = value.kind

  // Temporary compatibility for the first client cutover. The server still
  // enforces UUID-vs-PSID typing and never copies an arbitrary route value.
  if (!kind) {
    if (isUuid(orderData.facebookU)) {
      kind = 'facebook_uuid'
      value.facebookU = orderData.facebookU
    } else if (
      typeof orderData.subscriberid === 'string' &&
      SUBSCRIBER_ID_PATTERN.test(orderData.subscriberid)
    ) {
      kind = 'subscriber_psid'
      value.subscriberId = orderData.subscriberid
    } else {
      kind = 'default'
    }
  }

  if (kind === 'default') {
    return { kind }
  }

  if (kind === 'facebook_uuid') {
    if (!isUuid(value.facebookU)) {
      throw new ContractError(
        'FACEBOOK_UUID_INVALID',
        'The order link is invalid. Please ask for a new link.',
        400,
        false,
      )
    }
    return { kind, facebookU: value.facebookU }
  }

  if (kind === 'subscriber_psid') {
    if (
      typeof value.subscriberId !== 'string' ||
      !SUBSCRIBER_ID_PATTERN.test(value.subscriberId)
    ) {
      throw new ContractError(
        'SUBSCRIBER_ID_INVALID',
        'The order link is invalid. Please ask for a new link.',
        400,
        false,
      )
    }
    return { kind, subscriberId: value.subscriberId }
  }

  throw new ContractError(
    'ROUTE_IDENTITY_INVALID',
    'The order link is invalid. Please ask for a new link.',
    400,
    false,
  )
}

function normalizeOrderData(
  raw: unknown,
  routeIdentity: RouteIdentity,
): Record<string, unknown> {
  if (!isRecord(raw)) {
    throw new ContractError(
      'ORDER_DATA_INVALID',
      'The order details are invalid.',
      400,
      false,
    )
  }

  const orderData: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(raw)) {
    if (ORDER_COLUMNS.has(key)) {
      orderData[key] = normalizeScalar(value)
    }
  }

  const requiredText: Array<[string, string]> = [
    ['Name', 'Customer name'],
    ['contact', 'Contact number'],
    ['Addres', 'Delivery or pickup address'],
    ['DateEvent', 'Event date'],
    ['TimeEvent', 'Event time'],
    ['Product1', 'First product'],
    ['paymentOption', 'Payment option'],
  ]

  for (const [field, label] of requiredText) {
    if (
      typeof orderData[field] !== 'string' ||
      !orderData[field].trim()
    ) {
      throw new ContractError(
        'ORDER_FIELD_REQUIRED',
        `${label} is required.`,
        400,
        false,
      )
    }
  }

  if (
    typeof orderData.DateEvent !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(orderData.DateEvent)
  ) {
    throw new ContractError(
      'EVENT_DATE_INVALID',
      'Please choose a valid event date.',
      400,
      false,
    )
  }

  if (
    typeof orderData.TimeEvent !== 'string' ||
    !/^\d{2}:\d{2}(?::\d{2})?$/.test(orderData.TimeEvent)
  ) {
    throw new ContractError(
      'EVENT_TIME_INVALID',
      'Please choose a valid event time.',
      400,
      false,
    )
  }

  const numberProducts = Number(orderData.numberproducts ?? 1)
  if (!Number.isInteger(numberProducts) || numberProducts < 1 || numberProducts > 3) {
    throw new ContractError(
      'PRODUCT_COUNT_INVALID',
      'The order must contain between one and three products.',
      400,
      false,
    )
  }
  orderData.numberproducts = numberProducts

  const dateOrdered =
    typeof orderData.DateOrdered === 'string'
      ? orderData.DateOrdered.slice(0, 10)
      : new Date().toISOString().slice(0, 10)
  orderData.DateOrdered = /^\d{4}-\d{2}-\d{2}$/.test(dateOrdered)
    ? dateOrdered
    : new Date().toISOString().slice(0, 10)

  normalizeCoordinates(orderData)

  if (routeIdentity.kind === 'facebook_uuid') {
    orderData.facebookU = routeIdentity.facebookU
    orderData.subscriberid =
      typeof raw.subscriberid === 'string' &&
      SUBSCRIBER_ID_PATTERN.test(raw.subscriberid)
        ? raw.subscriberid
        : null
  } else if (routeIdentity.kind === 'subscriber_psid') {
    orderData.facebookU = null
    orderData.subscriberid = routeIdentity.subscriberId
  } else {
    orderData.facebookU = null
    orderData.subscriberid = null
  }

  return orderData
}

function normalizeCoordinates(orderData: Record<string, unknown>): void {
  const latitude = parseCoordinate(orderData.latitude)
  const longitude = parseCoordinate(orderData.longitude)

  if (latitude === null && longitude === null) {
    orderData.latitude = null
    orderData.longitude = null
    return
  }

  if (
    latitude === null ||
    longitude === null ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180 ||
    (latitude === 0 && longitude === 0)
  ) {
    throw new ContractError(
      'COORDINATES_INVALID',
      'The selected map location is invalid. You can continue with a complete typed address.',
      400,
      false,
    )
  }

  orderData.latitude = String(latitude)
  orderData.longitude = String(longitude)
}

function normalizeAssets(
  raw: unknown,
  submissionId: string,
): AssetReference[] {
  if (raw === undefined || raw === null) {
    return []
  }
  if (!Array.isArray(raw) || raw.length > MAX_UPLOAD_FILES) {
    throw new ContractError(
      'ASSET_LIST_INVALID',
      'The uploaded image list is invalid.',
      400,
      false,
    )
  }

  const requiredPrefix = `order-form/${submissionId}/`
  return raw.map((item) => {
    if (
      !isRecord(item) ||
      item.bucket !== ORDER_ASSET_BUCKET ||
      typeof item.path !== 'string' ||
      !item.path.startsWith(requiredPrefix) ||
      (item.kind !== 'product' && item.kind !== 'payment_screenshot')
    ) {
      throw new ContractError(
        'ASSET_REFERENCE_INVALID',
        'An uploaded image reference is invalid.',
        400,
        false,
      )
    }

    return {
      bucket: ORDER_ASSET_BUCKET,
      path: item.path,
      kind: item.kind,
    }
  })
}

function normalizeCustomer(
  raw: unknown,
  orderData: Record<string, unknown>,
): SubmissionRequest['customer'] {
  const value = isRecord(raw) ? raw : {}
  const name =
    typeof value.name === 'string'
      ? value.name.trim().slice(0, 255)
      : typeof orderData.Name === 'string'
        ? orderData.Name.trim().slice(0, 255)
        : undefined
  const email =
    typeof value.email === 'string' &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.email)
      ? value.email.trim().slice(0, 254)
      : undefined

  return name || email ? { name, email } : undefined
}

export function normalizeUploadRequest(raw: unknown): {
  submissionId: string
  files: UploadFileRequest[]
} {
  if (!isRecord(raw) || !isUuid(raw.submissionId)) {
    throw new ContractError(
      'SUBMISSION_ID_REQUIRED',
      'Please retry the upload from the order form.',
      400,
      false,
    )
  }

  if (
    !Array.isArray(raw.files) ||
    raw.files.length < 1 ||
    raw.files.length > MAX_UPLOAD_FILES
  ) {
    throw new ContractError(
      'UPLOAD_LIST_INVALID',
      'Please select valid images to upload.',
      400,
      false,
    )
  }

  const files: UploadFileRequest[] = raw.files.map((value) => {
    if (
      !isRecord(value) ||
      (value.kind !== 'product' && value.kind !== 'payment_screenshot') ||
      typeof value.contentType !== 'string' ||
      !(value.contentType in MIME_EXTENSIONS) ||
      typeof value.size !== 'number' ||
      !Number.isInteger(value.size) ||
      value.size <= 0 ||
      value.size > MAX_UPLOAD_BYTES
    ) {
      throw new ContractError(
        'UPLOAD_FILE_INVALID',
        'Each image must be JPEG, PNG, or WebP and no larger than 3MB.',
        400,
        false,
      )
    }

    return {
      kind: value.kind,
      contentType: value.contentType as keyof typeof MIME_EXTENSIONS,
      size: value.size,
    }
  })

  const paymentScreenshotCount = files.filter(
    (file) => file.kind === 'payment_screenshot',
  ).length
  const productImageCount = files.length - paymentScreenshotCount
  if (paymentScreenshotCount > 1 || productImageCount > 15) {
    throw new ContractError(
      'UPLOAD_LIMIT_EXCEEDED',
      'The form supports up to five images per product and one payment screenshot.',
      400,
      false,
    )
  }

  return {
    submissionId: raw.submissionId,
    files,
  }
}

export function uploadPath(
  submissionId: string,
  file: UploadFileRequest,
  index: number,
): string {
  const extension = MIME_EXTENSIONS[file.contentType]
  return `order-form/${submissionId}/${file.kind}-${index + 1}.${extension}`
}

function parseCoordinate(value: unknown): number | null {
  if (value === null || value === undefined || value === '') {
    return null
  }

  const number = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(number) ? number : Number.NaN
}

function normalizeScalar(value: unknown): unknown {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value
  }
  return null
}

async function findPaymentBySubmission(
  admin: AdminClient,
  submissionId: string,
): Promise<RecordedPayment | null> {
  const { data, error } = await admin
    .from('xendit_payments')
    .select(
      'id, order_id, xendit_invoice_id, xendit_external_id, status, amount, payment_link_url, final_order_id, submission_id',
    )
    .eq('submission_id', submissionId)
    .maybeSingle()

  if (error) {
    throw new ContractError(
      'PAYMENT_LOOKUP_FAILED',
      'We could not check the existing payment. Please try again.',
      503,
      true,
    )
  }

  return data as RecordedPayment | null
}

async function createXenditInvoice(
  req: Request,
  submission: NormalizedSubmission,
  pendingOrderId: string,
  externalId: string,
): Promise<XenditInvoice> {
  const origin = req.headers.get('origin')
  const publicOrigin = origin && isAllowedOrigin(origin) ? origin : DEFAULT_ORIGIN
  const payload: Record<string, unknown> = {
    external_id: externalId,
    amount: submission.payment.amount,
    description: `Payment for order ${pendingOrderId}`,
    success_redirect_url:
      `${publicOrigin}/#/thank-you?payment=success&submissionId=${submission.submissionId}`,
    failure_redirect_url: `${publicOrigin}/`,
  }

  if (submission.customer?.email) {
    payload.payer_email = submission.customer.email
  }
  if (submission.customer?.name || submission.customer?.email) {
    payload.customer = {
      given_names: submission.customer.name,
      email: submission.customer.email,
    }
  }

  const response = await xenditFetch('https://api.xendit.co/v2/invoices', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    throw new ContractError(
      'PAYMENT_PROVIDER_CREATE_FAILED',
      'We could not create the payment link. Please try again.',
      response.status >= 500 ? 503 : 400,
      response.status >= 500 || response.status === 409,
    )
  }

  return (await response.json()) as XenditInvoice
}

async function findXenditInvoiceByExternalId(
  externalId: string,
): Promise<XenditInvoice | null> {
  const url = new URL('https://api.xendit.co/v2/invoices')
  url.searchParams.set('external_id', externalId)
  url.searchParams.set('limit', '10')

  const response = await xenditFetch(url.toString(), { method: 'GET' })
  if (!response.ok) {
    if (response.status === 404) {
      return null
    }
    throw new ContractError(
      'PAYMENT_PROVIDER_UNAVAILABLE',
      'We could not reconcile the payment provider. Please try again.',
      503,
      true,
    )
  }

  const invoices = (await response.json()) as XenditInvoice[]
  const exactMatches = Array.isArray(invoices)
    ? invoices.filter((invoice) => invoice.external_id === externalId)
    : []

  if (exactMatches.length > 1) {
    throw new ContractError(
      'DUPLICATE_PROVIDER_INVOICES',
      'Multiple payment links were found. Please contact support with the attempt ID.',
      409,
      false,
    )
  }

  return exactMatches[0] ?? null
}

function validateInvoice(
  invoice: XenditInvoice,
  externalId: string,
  amount: number,
): void {
  if (
    !invoice ||
    !invoice.id ||
    invoice.external_id !== externalId ||
    Number(invoice.amount) !== Number(amount)
  ) {
    throw new ContractError(
      'PAYMENT_PROVIDER_MISMATCH',
      'The payment provider response did not match the order.',
      409,
      false,
    )
  }
}

async function xenditFetch(
  url: string,
  init: RequestInit,
): Promise<Response> {
  const secret = Deno.env.get('XENDIT_SECRET_KEY') ?? ''
  if (!secret) {
    throw new ContractError(
      'PAYMENT_CONFIGURATION_ERROR',
      'Card payments are temporarily unavailable.',
      503,
      true,
    )
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 15_000)

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        Authorization: `Basic ${btoa(`${secret}:`)}`,
        ...(init.headers ?? {}),
      },
    })
  } catch {
    throw new ContractError(
      'PAYMENT_PROVIDER_TIMEOUT',
      'The payment provider took too long to respond. Please retry.',
      503,
      true,
    )
  } finally {
    clearTimeout(timeoutId)
  }
}

function rpcContractError(error: { message?: string; code?: string }): ContractError {
  const message = error.message ?? ''

  if (message.includes('submission_payload_conflict')) {
    return new ContractError(
      'SUBMISSION_PAYLOAD_CONFLICT',
      'This retry no longer matches the original order request.',
      409,
      false,
    )
  }
  if (message.includes('preorder_already_submitted')) {
    return new ContractError(
      'PREORDER_ALREADY_SUBMITTED',
      'This pre-filled order has already been submitted.',
      409,
      false,
    )
  }
  if (message.includes('payment_invoice_conflict')) {
    return new ContractError(
      'PAYMENT_REFERENCE_MISMATCH',
      'The existing payment reference did not match the order.',
      409,
      false,
    )
  }

  return new ContractError(
    'ORDER_DATABASE_ERROR',
    'We could not save the order. Please try again.',
    503,
    true,
  )
}

function canonicalStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalStringify(item)).join(',')}]`
  }

  if (isRecord(value)) {
    return `{${Object.keys(value)
      .sort()
      .filter((key) => value[key] !== undefined)
      .map(
        (key) =>
          `${JSON.stringify(key)}:${canonicalStringify(value[key])}`,
      )
      .join(',')}}`
  }

  return JSON.stringify(value) ?? 'null'
}

async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

function firstRow<T>(value: unknown): T | null {
  if (Array.isArray(value)) {
    return (value[0] as T | undefined) ?? null
  }
  if (value && typeof value === 'object') {
    return value as T
  }
  return null
}

function getProductCount(orderData: Record<string, unknown>): number {
  const count = Number(orderData.numberproducts ?? 1)
  return Number.isInteger(count) && count >= 0 ? count : 0
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
