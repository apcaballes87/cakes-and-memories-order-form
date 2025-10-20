
import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import Header from '../components/Header';

const ThankYou = (): React.JSX.Element => {
  const location = useLocation();
  const navigate = useNavigate();
  const orderNumber = location.state?.orderNumber;

  const handleNewOrder = () => {
    // Navigate to a default order form, or use a specific user if needed
    navigate('/order/new-user/1');
  };

  return (
    <div className="font-sans">
      <Header />
      <main className="max-w-md mx-auto p-4 flex flex-col items-center justify-center text-center h-[calc(100vh-66px)]">
        <div className="bg-white p-8 rounded-2xl shadow-lg border border-gray-200">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 text-teal mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <h1 className="text-2xl font-bold text-primary mb-2">Thank You!</h1>
          <p className="text-gray-600 mb-4">Your order has been submitted successfully.</p>
          {orderNumber && (
            <div className="bg-lightBg p-3 rounded-lg border border-dashed border-primaryLight mb-6">
              <p className="text-sm text-gray-800">Your Order Number is:</p>
              <p className="text-lg font-bold text-primary">{orderNumber}</p>
            </div>
          )}
          <button
            onClick={handleNewOrder}
            className="w-full bg-primary text-white font-bold py-3 px-4 rounded-2xl hover:bg-opacity-90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary transition-all"
          >
            Create Another Order
          </button>
        </div>
      </main>
    </div>
  );
};

export default ThankYou;
