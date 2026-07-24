import { uploadFile } from '../services/supabaseClient';

export const MAX_SOURCE_IMAGE_BYTES = 20 * 1024 * 1024;
export const TARGET_IMAGE_BYTES = 3 * 1024 * 1024;
export const MAX_IMAGE_DIMENSION = 2048;
export const UPLOAD_TIMEOUT_MS = 30_000;
export const UPLOAD_CONCURRENCY = 3;
export const SUPPORTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

export type PendingUpload = {
  file: File;
  label: string;
  path: string;
};

export class ImageUploadError extends Error {
  readonly code: 'invalid_image' | 'image_too_large' | 'image_processing_failed' | 'upload_timeout' | 'upload_failed';
  readonly fileName: string;

  constructor(
    code: ImageUploadError['code'],
    fileName: string,
    message: string,
  ) {
    super(message);
    this.name = 'ImageUploadError';
    this.code = code;
    this.fileName = fileName;
  }
}

const extensionForType = (type: string): string => {
  if (type === 'image/png') return 'png';
  if (type === 'image/webp') return 'webp';
  return 'jpg';
};

const canvasToBlob = (
  canvas: HTMLCanvasElement,
  type: string,
  quality: number,
): Promise<Blob> =>
  new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => blob ? resolve(blob) : reject(new Error('The browser could not encode this image.')),
      type,
      quality,
    );
  });

type ImageSource = {
  drawable: CanvasImageSource;
  width: number;
  height: number;
  dispose: () => void;
};

const loadImageSource = async (file: File): Promise<ImageSource> => {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file);
      return {
        drawable: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        dispose: () => bitmap.close(),
      };
    } catch {
      // Some browsers and embedded webviews cannot decode through
      // createImageBitmap. Fall through to the standard image decoder.
    }
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error('The browser could not decode this image.'));
      element.src = objectUrl;
    });
    return {
      drawable: image,
      width: image.naturalWidth,
      height: image.naturalHeight,
      dispose: () => URL.revokeObjectURL(objectUrl),
    };
  } catch (error) {
    URL.revokeObjectURL(objectUrl);
    throw error;
  }
};

export const prepareImage = async (file: File): Promise<File> => {
  if (!SUPPORTED_IMAGE_TYPES.includes(file.type as typeof SUPPORTED_IMAGE_TYPES[number])) {
    throw new ImageUploadError(
      'invalid_image',
      file.name,
      `${file.name} is not supported. Please choose a JPG, PNG, or WebP image.`,
    );
  }
  if (file.size > MAX_SOURCE_IMAGE_BYTES) {
    throw new ImageUploadError('image_too_large', file.name, `${file.name} is larger than the 20 MB upload limit.`);
  }

  try {
    const source = await loadImageSource(file);
    const initialScale = Math.min(1, MAX_IMAGE_DIMENSION / Math.max(source.width, source.height));
    let width = Math.max(1, Math.round(source.width * initialScale));
    let height = Math.max(1, Math.round(source.height * initialScale));
    const outputType = file.type === 'image/png' && file.size <= TARGET_IMAGE_BYTES
      ? 'image/png'
      : 'image/jpeg';
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');

    if (!context) throw new Error('Image processing is unavailable in this browser.');

    let blob: Blob | null = null;
    let quality = 0.88;
    try {
      for (let pass = 0; pass < 8; pass += 1) {
        canvas.width = width;
        canvas.height = height;
        context.clearRect(0, 0, width, height);
        context.drawImage(source.drawable, 0, 0, width, height);
        blob = await canvasToBlob(canvas, outputType, quality);

        if (blob.size <= TARGET_IMAGE_BYTES) break;
        quality = Math.max(0.55, quality - 0.08);
        width = Math.max(1, Math.round(width * 0.88));
        height = Math.max(1, Math.round(height * 0.88));
      }
    } finally {
      source.dispose();
    }

    if (!blob) throw new Error('The image could not be prepared.');
    if (blob.size > TARGET_IMAGE_BYTES) {
      throw new Error('The image could not be reduced below the upload limit.');
    }

    return new File(
      [blob],
      `${file.name.replace(/\.[^.]+$/, '')}.${extensionForType(outputType)}`,
      { type: outputType, lastModified: file.lastModified },
    );
  } catch (error) {
    if (error instanceof ImageUploadError) throw error;
    throw new ImageUploadError(
      'image_processing_failed',
      file.name,
      `${file.name} could not be resized. Please choose a JPG, PNG, or WebP image under 3 MB.`,
    );
  }
};

const withTimeout = async <T,>(promise: Promise<T>, fileName: string): Promise<T> => {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new ImageUploadError(
      'upload_timeout',
      fileName,
      `${fileName} took too long to upload.`,
    )), UPLOAD_TIMEOUT_MS);
  });

  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
};

export const uploadPreparedImage = async ({ file, label, path }: PendingUpload): Promise<string> => {
  return uploadPreparedImageWith(
    { file, label, path },
    (upload) => uploadFile(upload.file, upload.path),
  );
};

export const uploadPreparedImageWith = async (
  upload: PendingUpload,
  uploader: (upload: PendingUpload) => Promise<string>,
): Promise<string> => {
  const { file, label } = upload;
  let lastError: unknown;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await withTimeout(uploader(upload), file.name);
    } catch (error) {
      lastError = error;
    }
  }

  if (lastError instanceof ImageUploadError) {
    throw new ImageUploadError(lastError.code, file.name, `${label}: ${lastError.message} Please try again.`);
  }

  throw new ImageUploadError(
    'upload_failed',
    file.name,
    `${label}: ${file.name} could not be uploaded after one retry. Please try again.`,
  );
};

export const uploadWithConcurrency = async (uploads: PendingUpload[]): Promise<string[]> => {
  return uploadWithConcurrencyUsing(uploads, uploadPreparedImage);
};

export const uploadWithConcurrencyUsing = async (
  uploads: PendingUpload[],
  uploader: (upload: PendingUpload) => Promise<string>,
): Promise<string[]> => {
  const results = new Array<string>(uploads.length);
  let nextIndex = 0;

  const worker = async () => {
    while (nextIndex < uploads.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await uploader(uploads[index]);
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(UPLOAD_CONCURRENCY, uploads.length) }, () => worker()),
  );
  return results;
};
