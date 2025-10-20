
import React from 'react';

interface FormSectionProps {
  title: string;
  children: React.ReactNode;
}

const FormSection = ({ title, children }: FormSectionProps): React.JSX.Element => (
  <div className="bg-white p-6 rounded-2xl shadow-sm mb-6 border border-gray-200">
    <h2 className="text-xl font-semibold text-primary mb-4 pb-2 border-b border-gray-200">{title}</h2>
    {children}
  </div>
);

export default FormSection;
