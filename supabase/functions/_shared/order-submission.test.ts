import {
  ContractError,
  normalizeUploadRequest,
  parseSubmissionRequest,
  uploadPath,
} from './order-submission.ts'

const denoTest = (
  Deno as unknown as {
    test(name: string, fn: () => void | Promise<void>): void
  }
).test

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`,
    )
  }
}

async function assertRejects(
  operation: () => Promise<unknown>,
  expectedError: typeof ContractError,
  messageIncludes: string,
): Promise<void> {
  try {
    await operation()
  } catch (error) {
    if (
      error instanceof expectedError &&
      error.message.includes(messageIncludes)
    ) {
      return
    }
    throw error
  }

  throw new Error('Expected operation to reject')
}

const baseOrderData = {
  Name: 'Test Customer',
  contact: '09170000000',
  Addres: 'Cebu City',
  DateOrdered: '2026-07-24T01:00:00.000Z',
  DateEvent: '2026-08-01',
  TimeEvent: '14:00:00',
  Product1: 'Cake',
  paymentOption: 'Store Payment',
  numberproducts: 1,
}

denoTest('numeric subscriber IDs never populate facebookU', async () => {
  const submission = await parseSubmissionRequest({
    submissionId: 'f4d53a90-86aa-46f4-8738-169a4912eff0',
    routeIdentity: {
      kind: 'subscriber_psid',
      subscriberId: '1234567890123456',
    },
    orderData: {
      ...baseOrderData,
      facebookU: '1234567890123456',
    },
    assets: [],
    payment: {
      mode: 'direct',
    },
  })

  assertEquals(submission.orderData.facebookU, null)
  assertEquals(submission.orderData.subscriberid, '1234567890123456')
  assertEquals(submission.preorderFacebookU, null)
})

denoTest('facebook UUID routes retain only a valid UUID identity', async () => {
  const facebookU = '7f4c7568-4098-4f0d-8fa7-9a78b1a6d742'
  const submission = await parseSubmissionRequest({
    submissionId: 'f4d53a90-86aa-46f4-8738-169a4912eff0',
    routeIdentity: {
      kind: 'facebook_uuid',
      facebookU,
    },
    orderData: {
      ...baseOrderData,
      facebookU: '1234567890123456',
    },
    assets: [],
    payment: {
      mode: 'direct',
    },
  })

  assertEquals(submission.orderData.facebookU, facebookU)
  assertEquals(submission.preorderFacebookU, facebookU)
})

denoTest('manual addresses retain null coordinates', async () => {
  const submission = await parseSubmissionRequest({
    submissionId: 'f4d53a90-86aa-46f4-8738-169a4912eff0',
    routeIdentity: {
      kind: 'default',
    },
    orderData: {
      ...baseOrderData,
      latitude: null,
      longitude: null,
    },
    assets: [],
    payment: {
      mode: 'direct',
    },
  })

  assertEquals(submission.orderData.latitude, null)
  assertEquals(submission.orderData.longitude, null)
})

denoTest('zero-zero map coordinates are rejected', async () => {
  await assertRejects(
    () =>
      parseSubmissionRequest({
        submissionId: 'f4d53a90-86aa-46f4-8738-169a4912eff0',
        routeIdentity: {
          kind: 'default',
        },
        orderData: {
          ...baseOrderData,
          latitude: 0,
          longitude: 0,
        },
        assets: [],
        payment: {
          mode: 'direct',
        },
      }),
    ContractError,
    'selected map location is invalid',
  )
})

denoTest('identical normalized retries have the same request fingerprint', async () => {
  const request = {
    submissionId: 'f4d53a90-86aa-46f4-8738-169a4912eff0',
    routeIdentity: {
      kind: 'default',
    },
    orderData: baseOrderData,
    assets: [],
    payment: {
      mode: 'xendit',
      amount: 1500,
    },
  }

  const first = await parseSubmissionRequest(request)
  const reorderedOrderData = Object.fromEntries(
    Object.entries(baseOrderData).reverse(),
  )
  const second = await parseSubmissionRequest({
    ...request,
    orderData: reorderedOrderData,
  })

  assertEquals(first.requestFingerprint, second.requestFingerprint)
})

denoTest('signed upload requests use deterministic non-PII paths', () => {
  const submissionId = 'f4d53a90-86aa-46f4-8738-169a4912eff0'
  const request = normalizeUploadRequest({
    submissionId,
    files: [
      {
        kind: 'payment_screenshot',
        contentType: 'image/jpeg',
        size: 512_000,
      },
    ],
  })

  assertEquals(
    uploadPath(request.submissionId, request.files[0], 0),
    `order-form/${submissionId}/payment_screenshot-1.jpg`,
  )
})

denoTest('all 16 currently supported form images can be initialized', () => {
  const files = Array.from({ length: 16 }, (_, index) => ({
    kind: index === 15 ? 'payment_screenshot' : 'product',
    contentType: 'image/webp',
    size: 128_000,
  }))
  const request = normalizeUploadRequest({
    submissionId: 'f4d53a90-86aa-46f4-8738-169a4912eff0',
    files,
  })

  assertEquals(request.files.length, 16)
})

denoTest('a seventeenth upload is rejected', () => {
  let errorCode: string | undefined
  try {
    normalizeUploadRequest({
      submissionId: 'f4d53a90-86aa-46f4-8738-169a4912eff0',
      files: Array.from({ length: 17 }, () => ({
        kind: 'product',
        contentType: 'image/jpeg',
        size: 128_000,
      })),
    })
  } catch (error) {
    if (error instanceof ContractError) {
      errorCode = error.code
    }
  }

  assertEquals(errorCode, 'UPLOAD_LIST_INVALID')
})
