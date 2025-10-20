
import React from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import OrderForm from './pages/OrderForm';
import ThankYou from './pages/ThankYou';

function App(): React.JSX.Element {
  return (
    <HashRouter>
      <Routes>
        <Route path="/order/:subscriberId/:numProducts" element={<OrderForm />} />
        <Route path="/thank-you" element={<ThankYou />} />
        <Route path="/" element={<Navigate to="/order/default-user/1" />} />
      </Routes>
    </HashRouter>
  );
}

export default App;
