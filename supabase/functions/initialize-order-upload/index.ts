import {
  ContractError,
  createAdminClient,
  errorResponse,
  jsonResponse,
  newAttemptId,
  normalizeError,
  normalizeUploadRequest,
  ORDER_ASSET_BUCKET,
  recordEvent,
  uploadPath,
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
        'This upload request is not supported.',
        405,
        false,
      )
    }

    admin = createAdminClient()
    const uploadRequest = normalizeUploadRequest(await req.json())
    submissionId = uploadRequest.submissionId

    const uploads = await Promise.all(
      uploadRequest.files.map(async (file, index) => {
        const path = uploadPath(submissionId as string, file, index)
        const { data, error } = await admin!.storage
          .from(ORDER_ASSET_BUCKET)
          .createSignedUploadUrl(path, { upsert: true })

        if (error || !data?.token) {
          throw new ContractError(
            'SIGNED_UPLOAD_FAILED',
            'We could not prepare an image upload. Please try again.',
            503,
            true,
          )
        }

        const { data: publicData } = admin!.storage
          .from(ORDER_ASSET_BUCKET)
          .getPublicUrl(path)

        return {
          kind: file.kind,
          bucket: ORDER_ASSET_BUCKET,
          path,
          token: data.token,
          publicUrl: publicData.publicUrl,
          contentType: file.contentType,
        }
      }),
    )

    await recordEvent(admin, {
      submissionId,
      attemptId,
      stage: 'upload',
      eventName: 'signed_uploads_issued',
      itemCount: uploads.length,
    })

    return jsonResponse(req, {
      kind: 'upload_initialized',
      submissionId,
      attemptId,
      uploads,
    })
  } catch (error) {
    const normalized = normalizeError(error)

    if (admin) {
      await recordEvent(admin, {
        submissionId,
        attemptId,
        stage: 'upload',
        eventName: 'upload_initialization_failed',
        errorCode: normalized.code,
      })
    }

    return errorResponse(req, error, attemptId, submissionId)
  }
})
