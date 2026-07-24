import {
  ContractError,
  createAdminClient,
  errorResponse,
  fetchXenditInvoiceById,
  findPaymentForVerification,
  isUuid,
  jsonResponse,
  newAttemptId,
  normalizeError,
  recordEvent,
  validateRecordedInvoice,
} from '../_shared/order-submission.ts'

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return jsonResponse(req, { ok: true })
  }

  const attemptId = newAttemptId()
  let submissionId: string | undefined
  let admin: ReturnType<typeof createAdminClient> | undefined

  try {
    if (req.method !== 'POST') {
      throw new ContractError(
        'METHOD_NOT_ALLOWED',
        'This payment request is not supported.',
        405,
        false,
      )
    }

    const raw = await req.json()
    const lookup =
      typeof raw === 'object' && raw !== null
        ? {
            submissionId:
              'submissionId' in raw && typeof raw.submissionId === 'string'
                ? raw.submissionId
                : undefined,
            invoiceId:
              'invoiceId' in raw && typeof raw.invoiceId === 'string'
                ? raw.invoiceId
                : undefined,
            orderId:
              'orderId' in raw && typeof raw.orderId === 'string'
                ? raw.orderId
                : undefined,
          }
        : {}

    if (lookup.submissionId && !isUuid(lookup.submissionId)) {
      throw new ContractError(
        'SUBMISSION_ID_INVALID',
        'The payment reference is invalid.',
        400,
        false,
      )
    }

    admin = createAdminClient()
    const payment = await findPaymentForVerification(admin, lookup)
    if (!payment) {
      throw new ContractError(
        'PAYMENT_NOT_FOUND',
        'We could not find this payment.',
        404,
        false,
      )
    }

    if (!isUuid(payment.submission_id)) {
      // Existing v26/v24 payments have no submission ID and may already have
      // been copied into the final table. Refuse to guess and duplicate them.
      throw new ContractError(
        'LEGACY_PAYMENT_REQUIRES_REVIEW',
        'This earlier payment needs manual verification. Please contact support with the attempt ID.',
        409,
        false,
      )
    }
    submissionId = payment.submission_id

    const invoice = await fetchXenditInvoiceById(
      payment.xendit_invoice_id,
    )
    validateRecordedInvoice(invoice, payment)

    if (invoice.status === 'PAID' || invoice.status === 'SETTLED') {
      const { data, error } = await admin.rpc('finalize_xendit_order', {
        p_submission_id: submissionId,
        p_invoice_id: invoice.id,
        p_external_id: invoice.external_id,
        p_paid_amount: invoice.amount,
        p_paid_at: invoice.paid_at ?? null,
        p_payment_method:
          invoice.payment_method ?? invoice.payment_channel ?? null,
      })

      if (error) {
        throw new ContractError(
          'PAYMENT_FINALIZATION_FAILED',
          'Your payment is confirmed, but the order is still finalizing. Please retry shortly.',
          503,
          true,
        )
      }

      const finalized = Array.isArray(data) ? data[0] : data
      await recordEvent(admin, {
        submissionId,
        attemptId,
        stage: 'completion',
        eventName: 'paid_order_finalized',
      })

      return jsonResponse(req, {
        kind: 'payment_status',
        submissionId,
        attemptId,
        status: 'PAID',
        orderId: finalized?.order_id ?? payment.final_order_id,
        orderNumber: finalized?.order_number ?? null,
      })
    }

    const { error: statusError } = await admin.rpc(
      'record_xendit_payment_status',
      {
        p_submission_id: submissionId,
        p_invoice_id: invoice.id,
        p_status: invoice.status,
        p_payment_method:
          invoice.payment_method ?? invoice.payment_channel ?? null,
        p_paid_amount: invoice.paid_amount ?? null,
        p_paid_at: invoice.paid_at ?? null,
      },
    )

    if (statusError) {
      throw new ContractError(
        'PAYMENT_STATUS_SAVE_FAILED',
        'We found the payment, but its status is still syncing. Please retry.',
        503,
        true,
      )
    }

    await recordEvent(admin, {
      submissionId,
      attemptId,
      stage: 'payment',
      eventName: 'payment_status_checked',
    })

    return jsonResponse(req, {
      kind: 'payment_status',
      submissionId,
      attemptId,
      status: invoice.status,
      invoiceId: invoice.id,
    })
  } catch (error) {
    const normalized = normalizeError(error)

    if (admin) {
      await recordEvent(admin, {
        submissionId,
        attemptId,
        stage: 'payment',
        eventName: 'payment_verification_failed',
        errorCode: normalized.code,
      })
    }

    return errorResponse(req, error, attemptId, submissionId)
  }
})
