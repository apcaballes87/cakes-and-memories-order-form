import {
  ContractError,
  createAdminClient,
  errorResponse,
  executeSubmission,
  isUuid,
  jsonResponse,
  newAttemptId,
  normalizeError,
  parseSubmissionRequest,
  recordEvent,
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
        'This order request is not supported.',
        405,
        false,
      )
    }

    const raw = await req.json()
    if (
      typeof raw === 'object' &&
      raw !== null &&
      'submissionId' in raw &&
      isUuid(raw.submissionId)
    ) {
      submissionId = raw.submissionId
    }

    admin = createAdminClient()
    const submission = await parseSubmissionRequest(raw)
    submissionId = submission.submissionId

    const response = await executeSubmission(
      req,
      submission,
      attemptId,
      admin,
    )
    return jsonResponse(req, response)
  } catch (error) {
    const normalized = normalizeError(error)

    if (admin) {
      await recordEvent(admin, {
        submissionId,
        attemptId,
        stage: 'validation',
        eventName: 'submission_failed',
        errorCode: normalized.code,
      })
    }

    return errorResponse(req, error, attemptId, submissionId)
  }
})
