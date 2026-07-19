import React from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import Header from '../components/Header';

const ThankYou = (): React.JSX.Element => {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  
  // Helper to extract query parameters from both URL search string (before hash) and hash query string (after hash)
  const getQueryParam = (name: string): string | null => {
    // 1. Try search parameters from the main URL search string (before hash)
    const urlParams = new URLSearchParams(window.location.search);
    let val = urlParams.get(name);
    if (val) return val;

    // 2. Try search parameters from the hash fragment query string (after hash)
    const hash = window.location.hash;
    const hashQueryIndex = hash.indexOf('?');
    if (hashQueryIndex !== -1) {
      const hashParams = new URLSearchParams(hash.substring(hashQueryIndex));
      val = hashParams.get(name);
      if (val) return val;
    }

    // 3. Fallback to the router's useSearchParams
    return searchParams.get(name);
  };

  const isPaymentSuccess = getQueryParam('payment') === 'success';
  const queryOrderId = getQueryParam('orderId');
  const [isVerifying, setIsVerifying] = React.useState(isPaymentSuccess && !!queryOrderId);
  const [verificationError, setVerificationError] = React.useState<string | null>(null);
  
  const orderNumber = location.state?.orderNumber || (isPaymentSuccess && queryOrderId ? `CEB-PREFILLED-${queryOrderId.slice(0,6)}` : null);

  React.useEffect(() => {
    if (isPaymentSuccess && queryOrderId) {
      const verifyPayment = async () => {
        try {
          const { error } = await import('../services/supabaseClient').then(m => m.supabase.functions.invoke('verify-xendit-payment', {
            body: { orderId: queryOrderId }
          }));
          if (error) {
            console.error('Error verifying payment:', error);
            setVerificationError('We had trouble verifying your payment automatically. Our team will verify it manually.');
          } else {
            console.log('Payment verified successfully');
          }
        } catch (err) {
          console.error('Verification failed:', err);
          setVerificationError('We had trouble verifying your payment automatically. Our team will verify it manually.');
        } finally {
          setIsVerifying(false);
        }
      };
      verifyPayment();
    }
  }, [isPaymentSuccess, queryOrderId]);

  const handleNewOrder = () => {
    // Navigate to a default order form, or use a specific user if needed
    navigate('/order/default-user/1');
  };

  return (
    <div className="font-sans">
      <Header />
      <main className="max-w-md mx-auto p-4 flex flex-col items-center justify-center text-center h-[calc(100vh-66px)]">
        <div className="bg-white p-8 rounded-2xl shadow-lg border border-gray-200">
          {isVerifying ? (
            <div className="flex flex-col items-center justify-center py-6">
               <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mb-4"></div>
               <h2 className="text-xl font-bold text-primary">Verifying Payment...</h2>
               <p className="text-gray-500 mt-2">Please wait while we confirm your transaction.</p>
            </div>
          ) : (
            <>
              <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 text-teal mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <h1 className="text-2xl font-bold text-primary mb-2">
                {isPaymentSuccess ? 'Payment Successful!' : 'Thank You!'}
              </h1>
              <p className="text-gray-600 mb-4">
                {isPaymentSuccess 
                  ? 'Your payment was successful and your order has been submitted to our system.' 
                  : 'Your order has been submitted successfully.'}
              </p>
              {verificationError && (
                 <p className="text-red-500 text-sm mb-4 bg-red-50 p-2 rounded">{verificationError}</p>
              )}
              {orderNumber && (
                <div className="bg-lightBg p-3 rounded-lg border border-dashed border-primaryLight mb-6">
                  <p className="text-sm text-gray-800">Your Order Reference is:</p>
                  <p className="text-lg font-bold text-primary">{orderNumber}</p>
                </div>
              )}

          <button
            onClick={handleNewOrder}
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
