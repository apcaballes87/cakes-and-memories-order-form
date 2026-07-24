import React from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { FunctionsHttpError } from '@supabase/supabase-js';
import Header from '../components/Header';
import { supabase } from '../services/supabaseClient';

type PaymentStatus = 'not_payment' | 'verifying' | 'confirmed' | 'pending';

type VerificationResponse = {
  status?: string;
  success?: boolean;
  orderNumber?: string | null;
  attemptId?: string;
};

const VERIFY_TIMEOUT_MS = 30_000;

const getHashQueryParam = (name: string): string | null => {
  const hashQueryIndex = window.location.hash.indexOf('?');
  if (hashQueryIndex === -1) return null;
  return new URLSearchParams(window.location.hash.substring(hashQueryIndex + 1)).get(name);
};

const verifyWithTimeout = async (
  body: Record<string, string>,
): Promise<{ data: unknown; error: unknown }> => {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(
      () => reject(new Error('payment_verification_timeout')),
      VERIFY_TIMEOUT_MS,
    );
  });

  try {
    return await Promise.race([
      supabase.functions.invoke('verify-xendit-payment', { body }),
      timeout,
    ]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
};

const ThankYou = (): React.JSX.Element => {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const getQueryParam = (name: string): string | null =>
    new URLSearchParams(window.location.search).get(name)
    || getHashQueryParam(name)
    || searchParams.get(name);

  const isPaymentReturn = getQueryParam('payment') === 'success';
  const submissionId = getQueryParam('submissionId');
  const queryOrderId = getQueryParam('orderId');
  const invoiceId = getQueryParam('invoiceId');
  const paymentLookup = submissionId
    ? { submissionId }
    : invoiceId
      ? { invoiceId }
      : queryOrderId
        ? { orderId: queryOrderId }
        : null;
  const [paymentStatus, setPaymentStatus] = React.useState<PaymentStatus>(
    isPaymentReturn ? 'verifying' : 'not_payment',
  );
  const [verificationError, setVerificationError] = React.useState<string | null>(null);
  const [verificationAttemptId, setVerificationAttemptId] = React.useState<string | null>(null);
  const [verifiedOrderNumber, setVerifiedOrderNumber] = React.useState<string | null>(null);
  const [verificationAttempt, setVerificationAttempt] = React.useState(0);

  const orderNumber = verifiedOrderNumber || location.state?.orderNumber || null;

  React.useEffect(() => {
    let cancelled = false;

    if (!isPaymentReturn) {
      setPaymentStatus('not_payment');
      return;
    }
    if (!paymentLookup) {
      setPaymentStatus('pending');
      setVerificationError('The payment return did not include a verification reference. Our team will verify it manually.');
      return;
    }

    setPaymentStatus('verifying');
    setVerificationError(null);
    setVerificationAttemptId(null);

    const verifyPayment = async () => {
      try {
        const { data, error } = await verifyWithTimeout(paymentLookup);
        if (error) throw error;
        if (cancelled) return;

        const response = data as VerificationResponse | null;
        const isConfirmed = response?.status === 'PAID'
          || response?.status === 'SETTLED'
          || (response?.success === true && Boolean(response.orderNumber));

        if (isConfirmed) {
          setPaymentStatus('confirmed');
          setVerifiedOrderNumber(response?.orderNumber || null);
        } else {
          setPaymentStatus('pending');
          setVerificationAttemptId(response?.attemptId || null);
          setVerificationError('Your payment is still being confirmed. Please do not submit another order.');
        }
      } catch (error) {
        if (cancelled) return;
        let message = 'We could not verify the payment automatically. Our team will verify it manually.';
        let attemptId: string | null = null;

        if (error instanceof FunctionsHttpError) {
          const body = await error.context.json().catch(() => null) as {
            message?: string;
            attemptId?: string;
          } | null;
          message = body?.message || message;
          attemptId = body?.attemptId || null;
        } else if (error instanceof Error && error.message === 'payment_verification_timeout') {
          message = 'Payment verification took too long. Please check your connection and retry.';
        }

        setPaymentStatus('pending');
        setVerificationError(message);
        setVerificationAttemptId(attemptId);
      }
    };

    void verifyPayment();
    return () => {
      cancelled = true;
    };
  }, [isPaymentReturn, submissionId, invoiceId, queryOrderId, verificationAttempt]);

  const heading = paymentStatus === 'confirmed'
    ? 'Payment Confirmed'
    : paymentStatus === 'not_payment'
      ? 'Thank You!'
      : 'Payment Verification';
  const message = paymentStatus === 'confirmed'
    ? 'Your payment is confirmed and your order has been created.'
    : paymentStatus === 'not_payment'
      ? 'Your order has been submitted successfully.'
      : 'We are checking the payment status before marking the order complete.';

  return (
    <div className="font-sans">
      <Header />
      <main className="max-w-md mx-auto p-4 flex flex-col items-center justify-center text-center min-h-[calc(100vh-66px)]">
        <div className="bg-white p-8 rounded-2xl shadow-lg border border-gray-200 w-full">
          {paymentStatus === 'verifying' ? (
            <div className="flex flex-col items-center justify-center py-6" role="status" aria-live="polite">
              <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mb-4" />
              <h1 className="text-xl font-bold text-primary">Verifying Payment…</h1>
              <p className="text-gray-500 mt-2">Please wait while we confirm your transaction.</p>
            </div>
          ) : (
            <>
              <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 text-teal mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <h1 className="text-2xl font-bold text-primary mb-2">{heading}</h1>
              <p className="text-gray-600 mb-4">{message}</p>

              {verificationError && (
                <div className="text-red-700 text-sm mb-4 bg-red-50 p-3 rounded-xl" role="alert">
                  <p>{verificationError}</p>
                  {verificationAttemptId && (
                    <p className="mt-2 text-xs">
                      Attempt ID: <span className="font-mono">{verificationAttemptId}</span>
                    </p>
                  )}
                  {isPaymentReturn && paymentLookup && (
                    <button
                      type="button"
                      onClick={() => setVerificationAttempt((attempt) => attempt + 1)}
                      className="mt-3 font-semibold text-primary hover:underline"
                    >
                      Retry verification
                    </button>
                  )}
                </div>
              )}

              {orderNumber && (
                <div className="bg-lightBg p-3 rounded-lg border border-dashed border-primaryLight mb-6">
                  <p className="text-sm text-gray-800">Your Order Reference is:</p>
                  <p className="text-lg font-bold text-primary">{orderNumber}</p>
                </div>
              )}

              <button
                onClick={() => navigate('/order/default-user/1')}
                className="w-full bg-primary text-white font-bold py-3 px-4 rounded-2xl hover:bg-opacity-90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary transition-all"
              >
                Create Another Order
              </button>
            </>
          )}
        </div>
      </main>
    </div>
  );
};

export default ThankYou;
