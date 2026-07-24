import React, { useState, useEffect, useRef } from 'react';
import { useForm, useFieldArray, Controller, type FieldErrors } from 'react-hook-form';
import { useParams, useNavigate } from 'react-router-dom';
import { FunctionsFetchError, FunctionsHttpError, FunctionsRelayError } from '@supabase/supabase-js';
import { supabase } from '../services/supabaseClient';
import { sendMessengerConfirmation } from '../services/messengerService';
import type { OrderFormData } from '../types';
import Header from '../components/Header';
import FormSection from '../components/FormSection';
import { Input, Textarea, Checkbox, ChoiceChipGroup } from '../components/FormElements';
import MapPlaceholder from '../components/MapPlaceholder';
import AddressModal from '../components/AddressModal';
import { Plus, Trash2, LoaderCircle } from 'lucide-react';
import {
  ImageUploadError,
  MAX_SOURCE_IMAGE_BYTES,
  prepareImage,
  SUPPORTED_IMAGE_TYPES,
  uploadPreparedImageWith,
  uploadWithConcurrency,
  uploadWithConcurrencyUsing,
  type PendingUpload,
} from '../utils/imageUpload';

const productOptions: { types: string[]; subTypes: Record<string, string[]> } = {
  types: ["1 Tier", "2 Tier", "3 Tier", "4 Tier", "Square or Rectangular", "Cupcakes & Pastries", "Other"],
  subTypes: {
    "1 Tier": ["Bento Cake (4\")", "6\" Round (4\" Thickness)", "8\" Round (4\" Thickness)", "9\" Round (4\" Thickness)", "10\" Round (4\" Thickness)", "6\" Round (5\" Thickness)", "8\" Round (5\" Thickness)", "9\" Round (5\" Thickness)", "10\" Round (5\" Thickness)", "6\" Round (6\" Thickness)", "8\" Round (6\" Thickness)", "Others"],
    "2 Tier": ["6\"x9\"", "7\"x10\"", "8\"x10\""],
    "3 Tier": ["5\"x8\"x12\"", "6\"x9\"x12\"", "7\"x10\"x14\""],
    "Square or Rectangular": ["8x12 Rectangular Cake", "10x14 Rectangular Cake", "12x16 Rectangular Cake", "8x8 Square Cake", "9x9 Square Cake", "10x10 Square Cake"],
    "Cupcakes & Pastries": ["Chocolate Cupcakes", "Vanilla Cupcakes", "Cakepops", "Brownies", "Custom Sugar Cookies", "Crinkles", "Macaroons"],
  }
};

const mapProductSize = (sizeStr: string) => {
  if (!sizeStr || sizeStr === 'N/A') return { type: '', subType: '', other: '' };
  
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const normalizedInput = normalize(sizeStr);

  for (const [type, subs] of Object.entries(productOptions.subTypes)) {
    const found = subs.find(s => normalize(s) === normalizedInput);
    if (found) return { type, subType: found, other: '' };
  }
  
  return { type: 'Other', subType: '', other: sizeStr };
};

// QR payment images to show per selected option
const PAYMENT_QR_MAP: Record<string, string> = {
  'GCash': 'https://congofivupobtfudnhni.supabase.co/storage/v1/object/public/files/paymentoptions/cakesandmemories-gcash.webp',
  'Maya': 'https://congofivupobtfudnhni.supabase.co/storage/v1/object/public/files/paymentoptions/cakesandmemories-maya.webp',
  'GoTyme': 'https://congofivupobtfudnhni.supabase.co/storage/v1/object/public/files/paymentoptions/cakesandmemories-gotyme.webp',
  'BPI Bank Transfer': 'https://congofivupobtfudnhni.supabase.co/storage/v1/object/public/files/paymentoptions/cakesandmemories-bpi.webp',
  'Unionbank': 'https://congofivupobtfudnhni.supabase.co/storage/v1/object/public/files/paymentoptions/cakesandmemories-unionbank.webp',
  'Metrobank': 'https://congofivupobtfudnhni.supabase.co/storage/v1/object/public/files/paymentoptions/cakesandmemories-metrobank.webp',
};

const PAYMENT_OPTIONS = ["GCash", "Maya", "GoTyme", "BPI Bank Transfer", "Unionbank", "Metrobank", "Credit Card", "Store Payment"];

type SubmissionStage = 'idle' | 'validating' | 'preparing' | 'uploading' | 'saving' | 'payment' | 'complete';

type VisibleSubmissionError = {
  code: string;
  message: string;
  attemptId: string;
};

type SignedUploadTarget = {
  kind: 'product' | 'payment_screenshot';
  bucket: string;
  path: string;
  token: string;
  publicUrl: string;
  contentType: string;
};

type ServerSubmissionResponse = {
  kind: 'order_created' | 'payment_required' | 'retryable_error';
  attemptId: string;
  orderNumber?: string | null;
  paymentUrl?: string;
  code?: string;
  message?: string;
};

const SUBMISSION_STAGE_LABELS: Record<SubmissionStage, string> = {
  idle: '',
  validating: 'Validating details…',
  preparing: 'Preparing images…',
  uploading: 'Uploading images…',
  saving: 'Saving order…',
  payment: 'Creating payment…',
  complete: 'Order created',
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SERVER_OWNED_SUBMISSION = import.meta.env.VITE_ORDER_SUBMISSION_API === 'server';
const SUBMISSION_NETWORK_TIMEOUT_MS = 30_000;

export const isUuid = (value: string | null | undefined): value is string =>
  Boolean(value && UUID_PATTERN.test(value.trim()));

class SubmissionTimeoutError extends Error {
  readonly stage: string;

  constructor(stage: string) {
    super(`${stage} took too long.`);
    this.name = 'SubmissionTimeoutError';
    this.stage = stage;
  }
}

const withSubmissionTimeout = async <T,>(
  operation: PromiseLike<T>,
  stage: string,
): Promise<T> => {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(
      () => reject(new SubmissionTimeoutError(stage)),
      SUBMISSION_NETWORK_TIMEOUT_MS,
    );
  });

  try {
    return await Promise.race([Promise.resolve(operation), timeout]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
};

const runInBackground = (operation: PromiseLike<unknown>) => {
  void Promise.resolve(operation).catch(() => undefined);
};

const getLocalDateInputValue = (): string => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const collectErrorEntries = (
  errors: FieldErrors<OrderFormData>,
  prefix = '',
): Array<{ path: string; message: string }> => {
  const entries: Array<{ path: string; message: string }> = [];

  Object.entries(errors).forEach(([key, value]) => {
    if (!value) return;
    const path = prefix ? `${prefix}.${key}` : key;
    if ('message' in value && typeof value.message === 'string') {
      entries.push({ path, message: value.message });
      return;
    }
    if (typeof value === 'object') {
      entries.push(...collectErrorEntries(value as FieldErrors<OrderFormData>, path));
    }
  });

  return entries;
};

const fieldAnchorId = (path: string): string => {
  if (path === 'address') return 'address-display';
  if (path === 'deliveryMethod' || path === 'paymentOption') return path;
  const match = path.match(/^products\.(\d+)\.(productType|productSubType)$/);
  if (match) return `products-${match[1]}-${match[2]}`;
  return path;
};

const customerSafeError = async (error: unknown): Promise<{ code: string; message: string }> => {
  if (error instanceof ImageUploadError) {
    return { code: error.code, message: error.message };
  }

  if (error instanceof SubmissionTimeoutError) {
    return {
      code: `${error.stage.toLowerCase().replace(/\s+/g, '_')}_timeout`,
      message: `${error.stage} took too long. Please check your connection and try again.`,
    };
  }

  if (error instanceof FunctionsHttpError) {
    const responseBody = await error.context.json().catch(() => null) as { code?: string; message?: string } | null;
    return {
      code: responseBody?.code || 'payment_service_error',
      message: responseBody?.message || 'The payment service could not complete this request. Please try again.',
    };
  }

  if (error instanceof FunctionsFetchError || error instanceof FunctionsRelayError) {
    return {
      code: 'payment_service_unavailable',
      message: 'The payment service is temporarily unavailable. Please check your connection and try again.',
    };
  }

  return {
    code: 'order_submission_failed',
    message: 'We could not save your order. Your details are still here—please try again.',
  };
};

const sanitizePathPart = (fileName: string): string =>
  fileName
    .toLowerCase()
    .replace(/\.[^.]+$/, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40) || 'image';

const validateSelectedImage = (file: File): string | null => {
  if (!SUPPORTED_IMAGE_TYPES.includes(file.type as typeof SUPPORTED_IMAGE_TYPES[number])) {
    return `${file.name} is not supported. Please choose a JPG, PNG, or WebP image.`;
  }
  if (file.size > MAX_SOURCE_IMAGE_BYTES) return `${file.name} is larger than the 20 MB upload limit.`;
  return null;
};

const OrderForm = (): React.JSX.Element => {
  const { subscriberId, facebookU } = useParams<{ subscriberId?: string; numProducts?: string; facebookU?: string }>();
  const normalizedFacebookU = isUuid(facebookU) ? facebookU.trim() : null;
  const routeSubscriberId = (
    subscriberId && subscriberId !== 'default-user'
      ? subscriberId
      : facebookU && facebookU !== 'default-user' && !normalizedFacebookU
        ? facebookU
        : null
  )?.trim() || null;
  const isDefaultUser = facebookU === 'default-user' || subscriberId === 'default-user' || (!facebookU && !subscriberId);
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionStage, setSubmissionStage] = useState<SubmissionStage>('idle');
  const [submissionError, setSubmissionError] = useState<VisibleSubmissionError | null>(null);
  const [validationErrors, setValidationErrors] = useState<Array<{ path: string; message: string }>>([]);
  const [activeSubscriberId, setActiveSubscriberId] = useState<string | null>(routeSubscriberId);
  const [imagePreviews, setImagePreviews] = useState<{ [key: number]: string[] }>({});
  const [imageSelectionErrors, setImageSelectionErrors] = useState<Record<number, string>>({});
  const [paymentPreview, setPaymentPreview] = useState<string | null>(null);
  const [isAddressModalOpen, setAddressModalOpen] = useState(false);
  const [deliveryCoordinates, setDeliveryCoordinates] = useState<{ lat: number; lng: number } | null>(null);
  const [addressSource, setAddressSource] = useState<'map' | 'manual'>('manual');
  const submissionIdRef = useRef(crypto.randomUUID());
  const submissionStageRef = useRef<SubmissionStage>('idle');
  const addressDisplayRef = useRef<HTMLDivElement>(null);
  const imagePreviewsRef = useRef(imagePreviews);
  const paymentPreviewRef = useRef(paymentPreview);

  const updateSubmissionStage = (stage: SubmissionStage) => {
    submissionStageRef.current = stage;
    setSubmissionStage(stage);
  };

  const {
    register,
    handleSubmit,
    control,
    watch,
    setValue,
    setError,
    clearErrors,
    formState: { errors },
  } = useForm<OrderFormData>({
    shouldFocusError: false,
    defaultValues: {
      facebookname: '',
      name: '',
      contact: '',
      address: '',
      deliveryMethod: 'Delivery',
      isDifferentReceiver: false,
      receiverName: '',
      receiverContact: '',
      dateEvent: '',
      timeEvent: '',
      products: [
        {
          productType: '',
          productSubType: '',
          otherProduct: '',
          message: '',
          details: '',
          quantity: 1,
          candle: '',
          images: [],
        }
      ],
      paymentOption: '',
      instructions: '',
      paymentScreenshot: null,
      price: 0,
    },
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: 'products',
  });

  // Hydrate UUID pre-filled routes. A final order is authoritative even when
  // the legacy pre-order "submitted" flag drifted.
  useEffect(() => {
    let cancelled = false;

    const fetchPreFilledData = async () => {
      if (!normalizedFacebookU || isDefaultUser) return;
      setIsLoading(true);
      try {
        const { data: submittedOrder, error: submittedOrderError } = await supabase
          .from('New Facebook Orders')
          .select('order_number_text')
          .eq('facebookU', normalizedFacebookU)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (submittedOrderError) throw submittedOrderError;
        if (cancelled) return;
        if (submittedOrder) {
          navigate('/thank-you', {
            state: { orderNumber: submittedOrder.order_number_text },
            replace: true,
          });
          return;
        }

        const { data, error } = await supabase
          .from('New PRE Facebook Orders')
          .select('*')
          .eq('facebookU', normalizedFacebookU)
          .maybeSingle();

        if (error) throw error;
        if (cancelled) return;
        if (data) {
          if (data.submitted) {
            setSubmissionError({
              code: 'unfinished_order_recovered',
              message: 'We found an unfinished order attempt. Your details have been restored so you can safely continue.',
              attemptId: submissionIdRef.current,
            });
          }
          const mappedProducts = [];
          
          // Map up to 3 products
          for (let i = 1; i <= 3; i++) {
            const productSize = data[`Product${i}`] || data[`product${i}`];
            if (productSize && productSize !== 'N/A') {
              const { type, subType, other } = mapProductSize(productSize);
              
              // Handle images for this product
              let existingImages: string[] = [];
              if (i === 1 && data.cakeimages) {
                existingImages = Array.isArray(data.cakeimages) ? data.cakeimages : [];
              } else if (i === 2 && data.pic2) {
                existingImages = [data.pic2];
              } else if (i === 3 && data.pic3) {
                existingImages = [data.pic3];
              }

              mappedProducts.push({
                productType: type,
                productSubType: subType,
                otherProduct: other,
                message: data[`Message${i}`] || data[`message${i}`] || '',
                details: data[`details${i}`] || '',
                quantity: data[`quantity${i}`] || data[`qty${i}`] || 1,
                candle: data[`Candle${i === 1 ? '' : i}`] || '',
                images: [],
                preExistingImages: existingImages
              });
            }
          }

          // If no products found, add one empty
          if (mappedProducts.length === 0) {
            mappedProducts.push({
              productType: '',
              productSubType: '',
              otherProduct: '',
              message: '',
              details: '',
              quantity: 1,
              candle: '',
              images: [],
            });
          }

          setValue('facebookname', data.facebookname || '');
          setValue('name', data.Name || '');
          setValue('contact', data.contact || '');
          setValue('address', data.Addres || '');
          const latitude = Number(data.latitude);
          const longitude = Number(data.longitude);
          if (
            Number.isFinite(latitude) &&
            Number.isFinite(longitude) &&
            !(latitude === 0 && longitude === 0)
          ) {
            setDeliveryCoordinates({ lat: latitude, lng: longitude });
            setAddressSource('map');
          } else {
            setDeliveryCoordinates(null);
            setAddressSource('manual');
          }
          setValue('dateEvent', data.DateEvent || '');
          setValue('timeEvent', data.TimeEvent ? data.TimeEvent.substring(0, 5) : '');
          setValue('paymentOption', data.paymentOption || '');
          setValue('instructions', data.Comment || '');
          setValue('price', data.totalorderprice || data.price || data.Price || data.paymentamount || 0);
          setValue('products', mappedProducts);
          
          if (data.subscriberid) {
            setActiveSubscriberId(String(data.subscriberid).trim());
          } else {
            // Fallback: Check aichatassistant table using the UUID
            const { data: chatData } = await supabase
              .from('aichatassistant')
              .select('subscriberid')
              .eq('newfacebookU', normalizedFacebookU)
              .maybeSingle();
            
            if (!cancelled && chatData?.subscriberid) {
              const trimmedId = String(chatData.subscriberid).trim();
              setActiveSubscriberId(trimmedId);
            }
          }

          if (data.orderNumber) {
             setValue('preExistingPaymentScreenshot', data.orderNumber);
          }

          if (data.Addres?.toLowerCase().includes('pickup')) {
            setValue('deliveryMethod', 'Pickup at Treehouse');
          } else {
            setValue('deliveryMethod', 'Delivery');
          }
        }
      } catch (err) {
        if (!cancelled) {
          setSubmissionError({
            code: 'prefill_load_failed',
            message: 'We could not load the saved order details. Please refresh and try again.',
            attemptId: submissionIdRef.current,
          });
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    fetchPreFilledData();
    return () => {
      cancelled = true;
    };
  }, [normalizedFacebookU, isDefaultUser, navigate, setValue]);

  // Effect to clean up object URLs on unmount
  useEffect(() => {
    imagePreviewsRef.current = imagePreviews;
  }, [imagePreviews]);

  useEffect(() => {
    paymentPreviewRef.current = paymentPreview;
  }, [paymentPreview]);

  useEffect(() => {
    return () => {
      Object.values(imagePreviewsRef.current).forEach((urls: string[]) => urls.forEach(URL.revokeObjectURL));
      if (paymentPreviewRef.current) {
        URL.revokeObjectURL(paymentPreviewRef.current);
      }
    };
  }, []);

  const deliveryMethod = watch('deliveryMethod');
  const isDifferentReceiver = watch('isDifferentReceiver');
  const watchedProducts = watch('products');
  const addressValue = watch('address');
  const watchPrice = watch('price');
  const watchPaymentOption = watch('paymentOption');

  useEffect(() => {
    if (deliveryMethod === 'Delivery') return;
    setValue('address', '');
    setDeliveryCoordinates(null);
    setAddressSource('manual');
    setValue('isDifferentReceiver', false);
    setValue('receiverName', '');
    setValue('receiverContact', '');
    clearErrors(['address', 'receiverName', 'receiverContact']);
  }, [clearErrors, deliveryMethod, setValue]);

  useEffect(() => {
    if (isDifferentReceiver) return;
    setValue('receiverName', '');
    setValue('receiverContact', '');
    clearErrors(['receiverName', 'receiverContact']);
  }, [clearErrors, isDifferentReceiver, setValue]);

  const { onChange: paymentScreenshotOnChange, ...paymentScreenshotRegister } = register("paymentScreenshot");

  const navigateToFirstError = (path: string) => {
    if (path === 'address') {
      setAddressModalOpen(true);
      window.setTimeout(() => {
        addressDisplayRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        addressDisplayRef.current?.focus({ preventScroll: true });
      }, 0);
      return;
    }

    window.setTimeout(() => {
      const target = document.getElementById(fieldAnchorId(path));
      target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      target?.focus({ preventScroll: true });
    }, 0);
  };

  const onInvalid = (invalidErrors: FieldErrors<OrderFormData>) => {
    const entries = collectErrorEntries(invalidErrors);
    setValidationErrors(entries);
    setSubmissionError(null);
    updateSubmissionStage('idle');
    setIsSubmitting(false);
    if (entries[0]) navigateToFirstError(entries[0].path);
  };

  const removeProduct = (indexToRemove: number) => {
    (imagePreviews[indexToRemove] || []).forEach(URL.revokeObjectURL);
    setImagePreviews((current) => Object.fromEntries(
      Object.entries(current)
        .filter(([index]) => Number(index) !== indexToRemove)
        .map(([index, urls]) => [
          Number(index) > indexToRemove ? Number(index) - 1 : Number(index),
          urls,
        ]),
    ));
    setImageSelectionErrors((current) => Object.fromEntries(
      Object.entries(current)
        .filter(([index]) => Number(index) !== indexToRemove)
        .map(([index, message]) => [
          Number(index) > indexToRemove ? Number(index) - 1 : Number(index),
          message,
        ]),
    ));
    remove(indexToRemove);
  };

  const onSubmit = async (data: OrderFormData) => {
    const submissionId = submissionIdRef.current;
    setIsSubmitting(true);
    setValidationErrors([]);
    setSubmissionError(null);
    updateSubmissionStage('validating');
    try {
      if (normalizedFacebookU) {
        const { data: existingOrder, error: existingOrderError } = await withSubmissionTimeout(
          supabase
            .from('New Facebook Orders')
            .select('order_number_text')
            .eq('facebookU', normalizedFacebookU)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle(),
          'Checking existing order',
        );

        if (existingOrderError) throw existingOrderError;
        if (existingOrder) {
          updateSubmissionStage('complete');
          navigate('/thank-you', {
            state: { orderNumber: existingOrder.order_number_text },
            replace: true,
          });
          return;
        }
      }

      const paymentScreenshotFile = data.paymentScreenshot?.[0];
      const uploads: Array<PendingUpload & { kind: 'payment' | 'product'; productIndex?: number }> = [];

      if (paymentScreenshotFile) {
        uploads.push({
          file: paymentScreenshotFile,
          label: 'Payment screenshot',
          path: '',
          kind: 'payment',
        });
      }

      data.products.forEach((product, productIndex) => {
        (product.images || []).forEach((file, imageIndex) => {
          uploads.push({
            file,
            label: `Product ${productIndex + 1} image ${imageIndex + 1}`,
            path: '',
            kind: 'product',
            productIndex,
          });
        });
      });

      updateSubmissionStage('preparing');
      const preparedUploads = new Array<typeof uploads[number]>(uploads.length);
      let nextPreparationIndex = 0;
      const prepareWorker = async () => {
        while (nextPreparationIndex < uploads.length) {
          const index = nextPreparationIndex;
          nextPreparationIndex += 1;
          const upload = uploads[index];
          const preparedFile = await prepareImage(upload.file);
          const extension = preparedFile.name.split('.').pop() || 'jpg';
          const slot = upload.kind === 'payment'
            ? 'payment'
            : `product-${(upload.productIndex ?? 0) + 1}-${index + 1}`;
          preparedUploads[index] = {
            ...upload,
            file: preparedFile,
            path: `order-form/${submissionId}/${slot}-${sanitizePathPart(upload.file.name)}.${extension}`,
          };
        }
      };

      await Promise.all(
        Array.from({ length: Math.min(3, uploads.length) }, () => prepareWorker()),
      );

      updateSubmissionStage('uploading');
      let uploadsReady = preparedUploads;
      let assetReferences: Array<{
        bucket: string;
        path: string;
        kind: 'product' | 'payment_screenshot';
      }> = [];
      let uploadedUrls: string[];

      if (SERVER_OWNED_SUBMISSION && preparedUploads.length > 0) {
        const { data: uploadInitialization, error: uploadInitializationError } = await withSubmissionTimeout(
          supabase.functions.invoke('initialize-order-upload', {
            body: {
              submissionId,
              files: preparedUploads.map((upload) => ({
                kind: upload.kind === 'payment' ? 'payment_screenshot' : 'product',
                contentType: upload.file.type,
                size: upload.file.size,
              })),
            },
          }),
          'Initializing uploads',
        );

        if (uploadInitializationError) throw uploadInitializationError;
        const signedTargets = (
          uploadInitialization as { uploads?: SignedUploadTarget[] } | null
        )?.uploads;
        if (!signedTargets || signedTargets.length !== preparedUploads.length) {
          throw new FunctionsRelayError('The upload service returned an incomplete response.');
        }

        uploadsReady = preparedUploads.map((upload, index) => ({
          ...upload,
          path: signedTargets[index].path,
        }));
        assetReferences = signedTargets.map((target) => ({
          bucket: target.bucket,
          path: target.path,
          kind: target.kind,
        }));
        const signedTargetByPath = new Map(
          signedTargets.map((target) => [target.path, target]),
        );

        uploadedUrls = await uploadWithConcurrencyUsing(
          uploadsReady,
          (upload) => uploadPreparedImageWith(upload, async (currentUpload) => {
            const target = signedTargetByPath.get(currentUpload.path);
            if (!target) throw new Error('Signed upload target is missing.');

            const { error } = await supabase.storage
              .from(target.bucket)
              .uploadToSignedUrl(target.path, target.token, currentUpload.file, {
                cacheControl: '3600',
                contentType: currentUpload.file.type,
              });
            if (error) throw error;
            return target.publicUrl;
          }),
        );
      } else {
        uploadedUrls = await uploadWithConcurrency(preparedUploads);
      }

      let paymentScreenshotUrl: string | null = data.preExistingPaymentScreenshot || null;
      const productImageUrls = data.products.map((product) => [...(product.preExistingImages || [])]);

      uploadsReady.forEach((upload, index) => {
        if (upload.kind === 'payment') {
          paymentScreenshotUrl = uploadedUrls[index];
        } else if (typeof upload.productIndex === 'number') {
          productImageUrls[upload.productIndex].push(uploadedUrls[index]);
        }
      });

      // Step 2: Construct the base order data object according to the mapping guide
      let finalAddress = '';
      switch (data.deliveryMethod) {
        case 'Pickup at Treehouse':
          finalAddress = 'PICKUP - Cakes and Memories Treehouse';
          break;
        case 'Delivery':
        default:
          finalAddress = data.address;
          break;
      }

      const orderData: Record<string, unknown> = {
        // Customer Info
        facebookname: data.facebookname || '',
        Name: data.name || '',
        contact: data.contact || '',

        // Delivery Info
        Addres: finalAddress,
        latitude: data.deliveryMethod === 'Delivery' ? deliveryCoordinates?.lat ?? null : null,
        longitude: data.deliveryMethod === 'Delivery' ? deliveryCoordinates?.lng ?? null : null,
        receiverName: data.isDifferentReceiver ? data.receiverName : '',
        receiverContact: data.isDifferentReceiver ? data.receiverContact : '',

        // Date & Time
        DateOrdered: new Date().toISOString(),
        DateEvent: data.dateEvent || '',
        TimeEvent: data.timeEvent ? `${data.timeEvent}:00` : '',

        // Payment & Additional
        paymentOption: data.paymentOption || '',
        Comment: data.instructions, // Temporarily set comment; will be updated with order number

        // Auto-generated/System Fields
        orderNumber: paymentScreenshotUrl || '',
        numberproducts: data.products.length,
        branch: "Cebu",
        payment: data.price || 0,
        copiedToList: false,
        hold: false,
        manychatlink: '',
        facebookU: isDefaultUser ? null : normalizedFacebookU,
        subscriberid: isDefaultUser ? null : (activeSubscriberId || null),
      };

      // Step 3: Map product data, ensuring all product columns are present
      data.products.forEach((product, index) => {
        if (index > 2) return;

        let productDescription = product.productType;
        if (product.productType === 'Other') {
          productDescription = product.otherProduct;
        } else if (product.productSubType) {
          if (product.productSubType === 'Others') {
            productDescription += ` - ${product.otherProduct || ''}`;
          } else {
            productDescription += ` - ${product.productSubType}`;
          }
        }

        // Get image URLs for this product - store as JSON array for multiple images
        const imageUrls = productImageUrls[index] || [];
        const imageValue = imageUrls.length > 0 ? JSON.stringify(imageUrls) : '';

        switch (index) {
          case 0:
            orderData['Product1'] = productDescription;
            orderData['code1'] = '';
            orderData['Message1'] = product.message || '';
            orderData['details1'] = product.details || '';
            orderData['quantity1'] = product.quantity || 0;
            orderData['Price1'] = 0;
            orderData['Candle'] = product.candle || '';
            orderData['orderLink'] = imageValue;
            break;
          case 1:
            orderData['Product2'] = productDescription;
            orderData['code2'] = '';
            orderData['message2'] = product.message || '';
            orderData['details2'] = product.details || '';
            orderData['quantity2'] = product.quantity || 0;
            orderData['price2'] = 0;
            orderData['candle2'] = product.candle || '';
            orderData['pic2'] = imageValue;
            break;
          case 2:
            orderData['product3'] = productDescription;
            orderData['code3'] = '';
            orderData['message3'] = product.message || '';
            orderData['details3'] = product.details || '';
            orderData['qty3'] = String(product.quantity || 0);
            orderData['candle3'] = product.candle || '';
            orderData['pic3'] = imageValue;
            break;
        }
      });

      // Step 4: Pad out unused product fields with default empty/zero values
      for (let i = data.products.length; i < 3; i++) {
        switch (i) {
          case 1:
            orderData['Product2'] = ''; orderData['code2'] = ''; orderData['message2'] = ''; orderData['details2'] = ''; orderData['quantity2'] = 0; orderData['price2'] = 0; orderData['candle2'] = ''; orderData['pic2'] = '';
            break;
          case 2:
            orderData['product3'] = ''; orderData['code3'] = ''; orderData['message3'] = ''; orderData['details3'] = ''; orderData['qty3'] = '0'; orderData['candle3'] = ''; orderData['pic3'] = '';
            break;
        }
      }

      const requiresCreditPayment = Boolean(
        !isDefaultUser &&
        data.price &&
        Number(data.price) > 0 &&
        data.paymentOption === 'Credit Card',
      );

      if (SERVER_OWNED_SUBMISSION) {
        updateSubmissionStage(requiresCreditPayment ? 'payment' : 'saving');
        const routeIdentity = normalizedFacebookU
          ? { kind: 'facebook_uuid' as const, facebookU: normalizedFacebookU }
          : routeSubscriberId
            ? { kind: 'subscriber_psid' as const, subscriberId: routeSubscriberId }
            : { kind: 'default' as const };
        const releaseSha = import.meta.env.VITE_RELEASE_SHA?.trim();
        const { data: serverResponseData, error: serverResponseError } = await withSubmissionTimeout(
          supabase.functions.invoke('submit-order', {
            body: {
              submissionId,
              routeIdentity,
              orderData,
              assets: assetReferences,
              payment: {
                mode: requiresCreditPayment ? 'xendit' : 'direct',
                amount: requiresCreditPayment ? Number(data.price) : undefined,
              },
              customer: { name: data.name },
              releaseSha: releaseSha || undefined,
            },
          }),
          requiresCreditPayment ? 'Creating payment' : 'Saving order',
        );

        if (serverResponseError) throw serverResponseError;
        const serverResponse = serverResponseData as ServerSubmissionResponse | null;
        if (!serverResponse) {
          throw new FunctionsRelayError('The order service returned an empty response.');
        }

        if (serverResponse.kind === 'order_created') {
          if (activeSubscriberId && activeSubscriberId !== 'default-user') {
            const fbMessage = `We received your order form! Your order number is ${serverResponse.orderNumber || ''}. Please give our staff time to confirm the payment image you sent. Thank you!`;
            void sendMessengerConfirmation(activeSubscriberId, fbMessage).catch(() => undefined);
            runInBackground(supabase
              .from('aichatassistant')
              .update({ firstmessagedate: null })
              .eq('subscriberid', activeSubscriberId));
          }
          updateSubmissionStage('complete');
          navigate('/thank-you', {
            state: { orderNumber: serverResponse.orderNumber },
          });
          return;
        }

        if (serverResponse.kind === 'payment_required' && serverResponse.paymentUrl) {
          if (activeSubscriberId && activeSubscriberId !== 'default-user') {
            const fbMessage = 'We received your order form! A representative will message you soon to confirm your order details. Thank you!';
            void sendMessengerConfirmation(activeSubscriberId, fbMessage).catch(() => undefined);
            runInBackground(supabase
              .from('aichatassistant')
              .update({ firstmessagedate: null })
              .eq('subscriberid', activeSubscriberId));
          }
          window.location.href = serverResponse.paymentUrl;
          return;
        }

        throw new FunctionsRelayError('The order service returned an invalid response.');
      }

      if (requiresCreditPayment) {
        updateSubmissionStage('payment');
        const xenditPayload = {
          submissionId,
          orderData,
          amount: Number(data.price),
          customerName: data.name,
          userId: normalizedFacebookU || '00000000-0000-0000-0000-000000000000',
        };

        const { data: xenditResponse, error: xenditError } = await withSubmissionTimeout(
          supabase.functions.invoke('create-xendit-payment', {
            body: xenditPayload,
          }),
          'Creating payment',
        );

        if (xenditError) throw xenditError;
        if (!xenditResponse || !xenditResponse.paymentUrl) {
          throw new FunctionsRelayError('The payment function did not return a payment URL.');
        }

        if (activeSubscriberId && activeSubscriberId !== 'default-user') {
          const fbMessage = `We received your order form! A representative will message you soon to confirm your order details. Thank you!`;
          sendMessengerConfirmation(activeSubscriberId, fbMessage)
            .catch(() => undefined);
        }

        if (activeSubscriberId && activeSubscriberId !== 'default-user') {
          runInBackground(supabase
            .from('aichatassistant')
            .update({ firstmessagedate: null })
            .eq('subscriberid', activeSubscriberId));
        }

        window.location.href = xenditResponse.paymentUrl;
        return;
      }

      updateSubmissionStage('saving');
      const { data: insertedData, error: insertError } = await withSubmissionTimeout(
        supabase
          .from('New Facebook Orders')
          .insert([orderData])
          .select('id, order_number_text')
          .single(),
        'Saving order',
      );

      if (insertError) throw insertError;
      if (!insertedData) throw new Error('Failed to create order and retrieve order details.');

      // Step 6: Use the auto-generated order number from the database
      let orderNumber = insertedData.order_number_text;

      // Fallback: If order_number_text is not available, use the database ID
      if (!orderNumber) {
        const today = new Date();
        const paddedId = String(insertedData.id).padStart(3, '0');
        const year = String(today.getFullYear()).slice(-2);
        const month = String(today.getMonth() + 1).padStart(2, '0');
        const day = String(today.getDate()).padStart(2, '0');
        orderNumber = `CEB-${year}${month}${day}-${paddedId}`;
      }

      // Step 7: Send automated Messenger confirmation
      if (activeSubscriberId && activeSubscriberId !== 'default-user') {
        const fbMessage = `We received your order form! Your order number is ${orderNumber}. Please give our staff time to confirm the payment image you sent. Thank you!`;
        sendMessengerConfirmation(activeSubscriberId, fbMessage)
          .catch(() => undefined);
      }

      if (normalizedFacebookU && !isDefaultUser) {
        runInBackground(supabase
          .from('New PRE Facebook Orders')
          .update({ submitted: true })
          .eq('facebookU', normalizedFacebookU));
      }

      if (activeSubscriberId && activeSubscriberId !== 'default-user') {
        runInBackground(supabase
          .from('aichatassistant')
          .update({ firstmessagedate: null })
          .eq('subscriberid', activeSubscriberId));
      }

      updateSubmissionStage('complete');
      navigate('/thank-you', { state: { orderNumber } });
    } catch (error) {
      const safeError = await customerSafeError(error);
      setSubmissionError({
        ...safeError,
        attemptId: submissionId,
      });
      console.warn('order_form_submission_failed', {
        submissionId,
        stage: submissionStageRef.current,
        routeKind: normalizedFacebookU ? 'facebook_uuid' : routeSubscriberId ? 'subscriber_psid' : 'default',
        productCount: data.products.length,
        imageCount: data.products.reduce((count, product) => count + (product.images?.length || 0), 0)
          + (data.paymentScreenshot?.length || 0),
        releaseSha: import.meta.env.VITE_RELEASE_SHA || 'unknown',
        errorCode: safeError.code,
      });
      updateSubmissionStage('idle');
    } finally {
      setIsSubmitting(false);
    }
  };

  const today = getLocalDateInputValue();

  return (
    <div className="font-sans relative">
      {isLoading && (
        <div className="fixed inset-0 bg-white/80 backdrop-blur-sm z-50 flex flex-col items-center justify-center">
          <LoaderCircle className="w-12 h-12 text-primary animate-spin mb-4" />
          <p className="text-gray-600 font-medium">Fetching order details...</p>
        </div>
      )}
      <Header />
      <main className="max-w-md mx-auto p-4">
        <form noValidate onSubmit={handleSubmit(onSubmit, onInvalid)} className="space-y-6">
          <FormSection title="Customer Details">
            <Input<OrderFormData> label="Facebook Name" name="facebookname" register={register} placeholder="e.g. Juan dela Cruz" isCapitalized />
            <Input<OrderFormData>
              label="First & Last Name"
              name="name"
              register={register}
              rules={{ required: 'First and last name are required' }}
              error={errors.name?.message}
              placeholder="e.g. Juan dela Cruz"
              isCapitalized
            />
            <Input<OrderFormData>
              label="Contact Number"
              name="contact"
              register={register}
              rules={{ required: 'Contact number is required' }}
              error={errors.contact?.message}
              placeholder="09XX XXX XXXX"
              type="tel"
              isPhoneNumber
            />
          </FormSection>

          <FormSection title="Delivery Information">
            <Controller
              control={control}
              name="deliveryMethod"
              rules={{ required: 'Please select a delivery or pickup option' }}
              render={({ field: { onChange, value, ref }, fieldState: { error } }) => (
                <ChoiceChipGroup
                  id="deliveryMethod"
                  label="Delivery or Pickup?"
                  options={["Delivery", "Pickup at Treehouse"]}
                  value={value}
                  onChange={onChange}
                  error={error?.message}
                  inputRef={ref}
                />
              )}
            />
            {deliveryMethod === 'Delivery' && (
              <>
                <div className="mb-4">
                  <label htmlFor="address-display" className="block text-sm font-medium text-gray-700 mb-1">Complete delivery address</label>
                  <div
                    id="address-display"
                    ref={addressDisplayRef}
                    onClick={() => setAddressModalOpen(true)}
                    className={`w-full px-4 py-3 border rounded-2xl bg-white cursor-pointer min-h-[50px] flex items-center focus:outline-none focus:ring-2 focus:ring-teal ${
                      errors.address ? 'border-red-500 ring-2 ring-red-500' : 'border-primaryLight'
                    }`}
                    aria-label="Set delivery address"
                    aria-invalid={Boolean(errors.address)}
                    aria-describedby={errors.address ? 'address-error' : undefined}
                    tabIndex={0}
                    role="button"
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setAddressModalOpen(true); }}
                  >
                    {addressValue ? (
                      <span className="text-gray-900">{addressValue}</span>
                    ) : (
                      <span className="text-gray-500">Enter the complete delivery address</span>
                    )}
                  </div>
                  <input type="hidden" {...register('address', { required: deliveryMethod === 'Delivery' ? 'Address is required for delivery' : false })} />
                  {errors.address && <p id="address-error" className="text-red-500 text-xs mt-1" role="alert">{errors.address.message}</p>}
                </div>

                <MapPlaceholder address={addressValue} coordinates={deliveryCoordinates} />

                <Checkbox<OrderFormData> label="Different Receiver" name="isDifferentReceiver" register={register} />
                {isDifferentReceiver && (
                  <div className="pl-4 border-l-2 border-primaryLight mt-4">
                    <Input<OrderFormData>
                      label="Receiver's Name"
                      name="receiverName"
                      register={register}
                      rules={{ required: isDifferentReceiver ? "Receiver's name is required" : false }}
                      error={errors.receiverName?.message}
                      placeholder="Receiver's full name"
                      isCapitalized
                    />
                    <Input<OrderFormData>
                      label="Receiver's Contact"
                      name="receiverContact"
                      register={register}
                      rules={{ required: isDifferentReceiver ? "Receiver's contact is required" : false }}
                      error={errors.receiverContact?.message}
                      placeholder="09XX XXX XXXX"
                      type="tel"
                      isPhoneNumber
                    />
                  </div>
                )}
              </>
            )}

            {deliveryMethod === 'Pickup at Treehouse' && (
              <div className="mt-4 p-4 bg-lightBg rounded-2xl border border-dashed border-primaryLight text-center">
                <p className="font-semibold text-primary">Pickup Location:</p>
                <p className="text-gray-800">Cakes and Memories Treehouse</p>
                <a href="https://maps.app.goo.gl/FPcQxJVM3taLjuzC7" target="_blank" rel="noopener noreferrer" className="text-teal hover:underline font-medium text-sm mt-1 inline-block">
                  View on Google Maps
                </a>
              </div>
            )}
          </FormSection>

          <FormSection title="Date & Time of Delivery / Pickup">
            <Input<OrderFormData>
              label="Date of Delivery / Pickup"
              name="dateEvent"
              register={register}
              rules={{
                required: 'Delivery or pickup date is required',
                validate: (value) => !value || value >= today || 'Date cannot be in the past',
              }}
              error={errors.dateEvent?.message}
              type="date"
              min={today}
            />
            <div className="mb-4">
              <label htmlFor="timeEvent" className="block text-sm font-medium text-gray-700 mb-1">Time of Delivery / Pickup</label>
              <select
                id="timeEvent"
                {...register("timeEvent", { required: "Time is required" })}
                aria-invalid={Boolean(errors.timeEvent)}
                aria-describedby={errors.timeEvent ? 'timeEvent-error' : undefined}
                className={`w-full px-4 py-3 border rounded-2xl bg-white focus:outline-none focus:ring-2 focus:ring-teal focus:border-teal transition-all ${
                  errors.timeEvent ? 'border-red-500' : 'border-primaryLight'
                }`}
              >
                <option value="">Select a time</option>
                <option value="10:00">10:00 AM</option>
                <option value="11:00">11:00 AM</option>
                <option value="12:00">12:00 PM</option>
                <option value="13:00">1:00 PM</option>
                <option value="14:00">2:00 PM</option>
                <option value="15:00">3:00 PM</option>
                <option value="16:00">4:00 PM</option>
                <option value="17:00">5:00 PM</option>
                <option value="18:00">6:00 PM</option>
                <option value="19:00">7:00 PM</option>
                <option value="20:00">8:00 PM</option>
              </select>
              {errors.timeEvent && <p id="timeEvent-error" className="text-red-500 text-xs mt-1" role="alert">{errors.timeEvent.message}</p>}
            </div>
          </FormSection>

          <FormSection title="Product Details">
            {fields.map((field, index) => {
              return (
                <div key={field.id} className="relative p-4 mb-4 border border-primaryLight rounded-2xl">
                  {fields.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeProduct(index)}
                      className="absolute top-2 right-2 p-1 text-red-500 hover:text-red-700 hover:bg-red-100 rounded-full"
                    >
                      <Trash2 size={18} />
                    </button>
                  )}
                  <h3 className="font-semibold text-gray-800 mb-2">Product {index + 1}</h3>

                  <Controller
                    control={control}
                    name={`products.${index}.productType`}
                    rules={{ required: 'Please select a product type' }}
                    render={({ field: { onChange, value, ref }, fieldState: { error } }) => (
                      <ChoiceChipGroup
                        id={`products-${index}-productType`}
                        label="Product Type"
                        options={productOptions.types}
                        value={value}
                        onChange={(nextValue) => {
                          onChange(nextValue);
                          setValue(`products.${index}.productSubType`, '');
                          setValue(`products.${index}.otherProduct`, '');
                          clearErrors([
                            `products.${index}.productType`,
                            `products.${index}.productSubType`,
                            `products.${index}.otherProduct`,
                          ]);
                        }}
                        error={error?.message}
                        inputRef={ref}
                      />
                    )}
                  />

                  {watchedProducts[index]?.productType && productOptions.subTypes[watchedProducts[index].productType] && (
                    <Controller
                      control={control}
                      name={`products.${index}.productSubType`}
                      rules={{ required: 'Please select an option' }}
                      render={({ field: { onChange, value, ref }, fieldState: { error } }) => (
                        <ChoiceChipGroup
                          id={`products-${index}-productSubType`}
                          label="Details"
                          options={productOptions.subTypes[watchedProducts[index].productType]}
                          value={value}
                          onChange={(nextValue) => {
                            onChange(nextValue);
                            if (nextValue !== 'Others') {
                              setValue(`products.${index}.otherProduct`, '');
                              clearErrors(`products.${index}.otherProduct`);
                            }
                          }}
                          error={error?.message}
                          inputRef={ref}
                        />
                      )}
                    />
                  )}

                  {(watchedProducts[index]?.productType === 'Other' || watchedProducts[index]?.productSubType === 'Others') && (
                    <Input<OrderFormData>
                      label="Please specify"
                      name={`products.${index}.otherProduct`}
                      register={register}
                      rules={{ required: 'Please specify the product details' }}
                      error={errors.products?.[index]?.otherProduct?.message}
                      placeholder="Specify product details"
                    />
                  )}

                  <Textarea<OrderFormData> label="Message on Cake" name={`products.${index}.message`} register={register} placeholder="e.g. Happy Birthday, Juan!" />
                  <Textarea<OrderFormData> label="Additional Details" name={`products.${index}.details`} register={register} placeholder="Design specifications, color, etc." />
                  <Input<OrderFormData>
                    label="Quantity"
                    name={`products.${index}.quantity`}
                    register={register}
                    rules={{
                      valueAsNumber: true,
                      required: 'Quantity is required',
                      min: { value: 1, message: 'Quantity must be at least 1' },
                    }}
                    error={errors.products?.[index]?.quantity?.message}
                    type="number"
                    min={1}
                  />
                  <Input<OrderFormData> label="Candle" name={`products.${index}.candle`} register={register} placeholder="e.g. 1pc stick candle" />
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Upload Images</label>
                    
                    {/* Pre-existing images from DB */}
                    {watchedProducts[index]?.preExistingImages && watchedProducts[index].preExistingImages!.length > 0 && (
                      <div className="flex flex-wrap gap-2 mb-3">
                        {watchedProducts[index].preExistingImages!.map((url, imgIndex) => (
                          <div key={`existing-${imgIndex}`} className="relative w-20 h-20 group">
                            <img
                              src={url}
                              alt={`Existing ${imgIndex + 1}`}
                              className="w-full h-full object-cover rounded-xl border border-gray-300 opacity-80"
                            />
                            <div className="absolute inset-0 flex items-center justify-center bg-black/20 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity">
                               <span className="text-[8px] text-white font-bold bg-black/40 px-1 rounded">PRE-FILLED</span>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                const current = [...(watchedProducts[index].preExistingImages || [])];
                                current.splice(imgIndex, 1);
                                setValue(`products.${index}.preExistingImages`, current);
                              }}
                              className="absolute -top-1 -right-1 p-0.5 bg-red-500 text-white rounded-full shadow-md hover:bg-red-600 transition-colors"
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Image preview grid */}
                    {imagePreviews[index] && imagePreviews[index].length > 0 && (
                      <div className="flex flex-wrap gap-2 mb-3">
                        {imagePreviews[index].map((previewUrl, imgIndex) => (
                          <div key={imgIndex} className="relative w-20 h-20">
                            <img
                              src={previewUrl}
                              alt={`Preview ${imgIndex + 1}`}
                              className="w-full h-full object-cover rounded-xl border border-gray-300"
                            />
                            <button
                              type="button"
                              onClick={() => {
                                // Revoke the URL and remove the image
                                URL.revokeObjectURL(previewUrl);
                                setImagePreviews(prev => {
                                  const newPreviews = { ...prev };
                                  newPreviews[index] = newPreviews[index].filter((_, i) => i !== imgIndex);
                                  if (newPreviews[index].length === 0) {
                                    delete newPreviews[index];
                                  }
                                  return newPreviews;
                                });
                                // Update form state
                                const currentImages = watch(`products.${index}.images`) || [];
                                setValue(`products.${index}.images`, currentImages.filter((_, i) => i !== imgIndex));
                              }}
                              className="absolute -top-1 -right-1 p-0.5 bg-red-500 text-white rounded-full shadow-md hover:bg-red-600 transition-colors"
                              aria-label={`Remove image ${imgIndex + 1}`}
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Add image button - limit to 5 images */}
                    {(!imagePreviews[index] || imagePreviews[index].length < 5) && (
                      <label
                        className="flex items-center justify-center gap-2 px-4 py-3 border border-dashed border-primaryLight text-primary rounded-2xl hover:bg-pink-50 cursor-pointer transition-colors"
                        tabIndex={0}
                        role="button"
                        aria-label="Add image"
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') e.currentTarget.click(); }}
                      >
                        <Plus size={18} />
                        <span className="text-sm font-medium">
                          {imagePreviews[index]?.length ? 'Add Another Image' : 'Add Image'}
                        </span>
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              const selectionError = validateSelectedImage(file);
                              if (selectionError) {
                                setImageSelectionErrors((current) => ({ ...current, [index]: selectionError }));
                                e.target.value = '';
                                return;
                              }
                              setImageSelectionErrors((current) => {
                                const next = { ...current };
                                delete next[index];
                                return next;
                              });
                              // Add to previews
                              const url = URL.createObjectURL(file);
                              setImagePreviews(prev => ({
                                ...prev,
                                [index]: [...(prev[index] || []), url]
                              }));
                              // Add to form state
                              const currentImages = watch(`products.${index}.images`) || [];
                              setValue(`products.${index}.images`, [...currentImages, file]);
                            }
                            // Reset input so same file can be selected again
                            e.target.value = '';
                          }}
                        />
                      </label>
                    )}

                    {imageSelectionErrors[index] && (
                      <p className="text-xs text-red-500 mt-1" role="alert">{imageSelectionErrors[index]}</p>
                    )}

                    {imagePreviews[index] && imagePreviews[index].length >= 5 && (
                      <p className="text-xs text-gray-500 mt-1">Maximum 5 images per product</p>
                    )}
                  </div>
                </div>
              )
            })}
            {fields.length < 3 && (
              <button
                type="button"
                onClick={() => append({ productType: '', productSubType: '', otherProduct: '', message: '', details: '', quantity: 1, candle: '', images: [] })}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 border border-dashed border-primaryLight text-primary rounded-2xl hover:bg-pink-50 transition-colors"
              >
                <Plus size={18} /> Add Another Product
              </button>
            )}
          </FormSection>

          <FormSection title="Payment & Instructions">
            {!isDefaultUser && (
              <Input<OrderFormData> 
                label="TOTAL ORDER PRICE" 
                name="price" 
                register={register} 
                type="number" 
                step="0.01" 
                placeholder="0.00" 
              />
            )}
            <Controller
              control={control}
              name="paymentOption"
              rules={{ required: 'Please select a payment option' }}
              render={({ field: { onChange, value, ref }, fieldState: { error } }) => (
                <ChoiceChipGroup
                  id="paymentOption"
                  label="Payment Option"
                  options={PAYMENT_OPTIONS}
                  value={value}
                  onChange={(nextValue) => {
                    onChange(nextValue);
                    if (nextValue === 'Store Payment') {
                      setValue('paymentScreenshot', null);
                      setValue('preExistingPaymentScreenshot', '');
                      if (paymentPreviewRef.current) URL.revokeObjectURL(paymentPreviewRef.current);
                      setPaymentPreview(null);
                      clearErrors('paymentScreenshot');
                    }
                  }}
                  error={error?.message}
                  inputRef={ref}
                />
              )}
            />

            {/* QR Code display for e-wallet / bank transfer options */}
            {watchPaymentOption && PAYMENT_QR_MAP[watchPaymentOption] && (
              <div className="mb-4 flex flex-col items-center gap-2 animate-fade-in">
                <p className="text-sm font-semibold text-gray-700">Scan to Pay via {watchPaymentOption}</p>
                <img
                  src={PAYMENT_QR_MAP[watchPaymentOption]}
                  alt={`${watchPaymentOption} QR`}
                  className="w-64 h-auto rounded-2xl border border-gray-200 shadow-md"
                />
                <p className="text-xs text-gray-500 text-center">After paying, please upload your payment screenshot below.</p>
              </div>
            )}

            {/* Screenshot upload is available for online payments; store payment does not need one. */}
            {watchPaymentOption !== 'Store Payment' && (
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">Upload Payment Screenshot</label>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  {...paymentScreenshotRegister}
                  onChange={(e) => {
                    paymentScreenshotOnChange(e);
                    const file = e.target.files?.[0];
                    if (paymentPreview) {
                      URL.revokeObjectURL(paymentPreview);
                    }
                    if (file) {
                      const selectionError = validateSelectedImage(file);
                      if (selectionError) {
                        setError('paymentScreenshot', { type: 'validate', message: selectionError });
                        e.target.value = '';
                        setValue('paymentScreenshot', null);
                        setPaymentPreview(null);
                        return;
                      }
                      clearErrors('paymentScreenshot');
                      const url = URL.createObjectURL(file);
                      setPaymentPreview(url);
                    } else {
                      setPaymentPreview(null);
                    }
                  }}
                  className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-pink-50 file:text-primary hover:file:bg-pink-100"
                />
                {errors.paymentScreenshot && (
                  <p className="mt-1 text-sm text-red-500 font-medium">{errors.paymentScreenshot.message as string}</p>
                )}
              </div>
            )}
            {/* Pre-existing payment screenshot */}
            {!paymentPreview && watch('preExistingPaymentScreenshot') && (
              <div className="mb-4 relative w-28 h-28 group">
                <img src={watch('preExistingPaymentScreenshot')} alt="Payment Preview" className="w-full h-full object-cover rounded-2xl border border-gray-300 opacity-80" />
                <div className="absolute inset-0 flex items-center justify-center bg-black/20 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity">
                   <span className="text-[10px] text-white font-bold bg-black/40 px-2 py-1 rounded">PRE-FILLED</span>
                </div>
                <button
                  type="button"
                  onClick={() => setValue('preExistingPaymentScreenshot', '')}
                  className="absolute -top-2 -right-2 p-1 bg-red-500 text-white rounded-full shadow-md hover:bg-red-600 transition-colors"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            )}
            {paymentPreview && (
              <div className="mb-4 relative w-28 h-28">
                <img src={paymentPreview} alt="Payment Preview" className="w-full h-full object-cover rounded-2xl border border-gray-300" />
                <button
                  type="button"
                  onClick={() => {
                    setValue(`paymentScreenshot`, null);
                    if (paymentPreview) {
                      URL.revokeObjectURL(paymentPreview);
                    }
                    setPaymentPreview(null);
                  }}
                  className="absolute -top-2 -right-2 p-1 bg-red-500 text-white rounded-full shadow-md hover:bg-red-600 transition-colors"
                  aria-label="Remove payment screenshot"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            )}
            <Textarea<OrderFormData> label="Special Instructions" name="instructions" register={register} placeholder="Any other notes for your order." />
          </FormSection>

          {validationErrors.length > 0 && (
            <div className="rounded-2xl border border-red-300 bg-red-50 p-4" role="alert" aria-live="assertive">
              <p className="font-semibold text-red-800">Please check the highlighted details:</p>
              <ul className="mt-2 list-disc pl-5 text-sm text-red-700 space-y-1">
                {validationErrors.map((entry) => (
                  <li key={entry.path}>{entry.message}</li>
                ))}
              </ul>
            </div>
          )}

          {submissionError && (
            <div
              className={`rounded-2xl border p-4 ${
                submissionError.code === 'unfinished_order_recovered'
                  ? 'border-teal bg-cyan-50 text-cyan-900'
                  : 'border-red-300 bg-red-50 text-red-800'
              }`}
              role={submissionError.code === 'unfinished_order_recovered' ? 'status' : 'alert'}
              aria-live="assertive"
            >
              <p className="font-semibold">
                {submissionError.code === 'unfinished_order_recovered' ? 'Order details recovered' : 'Order not submitted'}
              </p>
              <p className="mt-1 text-sm">{submissionError.message}</p>
              <p className="mt-2 text-xs">
                Attempt ID: <span className="font-mono">{submissionError.attemptId}</span>
              </p>
            </div>
          )}

          {isSubmitting && (
            <p className="text-center text-sm font-medium text-gray-700" role="status" aria-live="polite">
              {SUBMISSION_STAGE_LABELS[submissionStage]}
            </p>
          )}

          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <button
              type="submit"
              disabled={isSubmitting}
              onClick={() => updateSubmissionStage('validating')}
              className="flex-1 bg-primary text-white font-bold py-4 rounded-2xl hover:bg-opacity-90 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
            >
              {isSubmitting ? (
                <span className="flex items-center justify-center gap-2">
                  <LoaderCircle className="w-5 h-5 animate-spin" />
                  {SUBMISSION_STAGE_LABELS[submissionStage]}
                </span>
              ) : (
                !isDefaultUser && watchPrice && Number(watchPrice) > 0 && watchPaymentOption === 'Credit Card'
                  ? `Pay via Credit Card ₱${Number(watchPrice).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                  : "Submit Order"
              )}
            </button>

          </div>

          {/* Show Xendit / Secure Payment trust badges only when Credit Card is selected */}
          {!isDefaultUser && watchPaymentOption === 'Credit Card' && (
            <div className="flex flex-wrap gap-6 items-center justify-center pt-2">
              <img
                src="https://cqmhanqnfybyxezhobkx.supabase.co/storage/v1/object/public/landingpage/xendit-blue.webp"
                alt="Xendit"
                className="h-10 w-auto object-contain"
              />
              <img
                src="https://cqmhanqnfybyxezhobkx.supabase.co/storage/v1/object/public/landingpage/securepayment-green.webp"
                alt="Secure Payment"
                className="h-10 w-auto object-contain"
              />
            </div>
          )}
        </form>
      </main>
      <AddressModal
        isOpen={isAddressModalOpen}
        onClose={() => setAddressModalOpen(false)}
        currentSelection={{
          address: addressValue || '',
          coordinates: deliveryCoordinates,
          source: addressSource,
        }}
        onSelect={(selection) => {
          setValue('address', selection.address, { shouldValidate: true });
          setDeliveryCoordinates(selection.coordinates);
          setAddressSource(selection.source);
          clearErrors('address');
          setAddressModalOpen(false);
        }}
      />
    </div>
  );
};

export default OrderForm;
