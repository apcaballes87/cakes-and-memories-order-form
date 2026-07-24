import { afterEach, describe, expect, it, vi } from 'vitest';

const uploadFileMock = vi.hoisted(() => vi.fn());

vi.mock('../services/supabaseClient', () => ({
  uploadFile: uploadFileMock,
}));

import {
  ImageUploadError,
  prepareImage,
  uploadPreparedImage,
  uploadWithConcurrency,
  UPLOAD_TIMEOUT_MS,
} from '../utils/imageUpload';

const imageFile = (name: string) => new File(['image'], name, { type: 'image/jpeg' });

describe('image upload reliability', () => {
  afterEach(() => {
    vi.useRealTimers();
    uploadFileMock.mockReset();
  });

  it('rejects unsupported files before upload', async () => {
    await expect(
      prepareImage(new File(['not-image'], 'details.txt', { type: 'text/plain' })),
    ).rejects.toMatchObject<ImageUploadError>({
      code: 'invalid_image',
      fileName: 'details.txt',
    });
  });

  it('times out, retries once, and names the failed file', async () => {
    vi.useFakeTimers();
    uploadFileMock.mockImplementation(() => new Promise(() => undefined));
    const promise = uploadPreparedImage({
      file: imageFile('birthday-cake.jpg'),
      label: 'Product 1 image 1',
      path: 'order-form/submission/product-1.jpg',
    });
    const rejection = expect(promise).rejects.toMatchObject({
      code: 'upload_timeout',
      fileName: 'birthday-cake.jpg',
    });

    await vi.advanceTimersByTimeAsync(UPLOAD_TIMEOUT_MS);
    await vi.advanceTimersByTimeAsync(UPLOAD_TIMEOUT_MS);
    await rejection;
    expect(uploadFileMock).toHaveBeenCalledTimes(2);
  });

  it('never uploads more than three files concurrently', async () => {
    let active = 0;
    let maximumActive = 0;
    uploadFileMock.mockImplementation(async (_file: File, path: string) => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
      return `https://example.test/${path}`;
    });

    const uploads = Array.from({ length: 7 }, (_, index) => ({
      file: imageFile(`image-${index + 1}.jpg`),
      label: `Image ${index + 1}`,
      path: `order-form/submission/image-${index + 1}.jpg`,
    }));
    const results = await uploadWithConcurrency(uploads);

    expect(results).toHaveLength(7);
    expect(maximumActive).toBe(3);
  });
});
