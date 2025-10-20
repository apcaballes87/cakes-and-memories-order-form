import React from 'react';
import type { UseFormRegister, FieldValues, Path } from 'react-hook-form';
import { capitalizeWords, formatPhoneNumber } from '../utils/helpers';

interface InputProps<T extends FieldValues> extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  name: Path<T>;
  register: UseFormRegister<T>;
  error?: string;
  isPhoneNumber?: boolean;
  isCapitalized?: boolean;
}

export const Input = <T extends FieldValues,>({
  label,
  name,
  register,
  error,
  type = 'text',
  isPhoneNumber = false,
  isCapitalized = false,
  ...props
}: InputProps<T>): React.JSX.Element => {
  const { onChange, ...rest } = register(name);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = e.target.value;
    if (isPhoneNumber) {
        value = formatPhoneNumber(value);
    }
    if (isCapitalized) {
        value = capitalizeWords(value);
    }
    e.target.value = value;
    onChange(e);
  };
  
  return (
    <div className="mb-4">
      <label htmlFor={name} className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <input
        id={name}
        type={type}
        {...rest}
        onChange={handleChange}
        className="w-full px-4 py-3 border border-primaryLight rounded-2xl focus:outline-none focus:ring-2 focus:ring-teal focus:border-teal transition-all"
        {...props}
      />
      {error && <p className="text-red-500 text-xs mt-1">{error}</p>}
    </div>
  );
};

interface TextareaProps<T extends FieldValues> extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
  name: Path<T>;
  register: UseFormRegister<T>;
  error?: string;
}

export const Textarea = <T extends FieldValues,>({
  label,
  name,
  register,
  error,
  ...props
}: TextareaProps<T>): React.JSX.Element => (
  <div className="mb-4">
    <label htmlFor={name} className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
    <textarea
      id={name}
      {...register(name)}
      className="w-full px-4 py-3 border border-primaryLight rounded-2xl focus:outline-none focus:ring-2 focus:ring-teal focus:border-teal transition-all"
      rows={3}
      {...props}
    />
    {error && <p className="text-red-500 text-xs mt-1">{error}</p>}
  </div>
);

interface CheckboxProps<T extends FieldValues> extends React.InputHTMLAttributes<HTMLInputElement> {
  label: React.ReactNode;
  name: Path<T>;
  register: UseFormRegister<T>;
}

export const Checkbox = <T extends FieldValues,>({
  label,
  name,
  register,
  ...props
}: CheckboxProps<T>): React.JSX.Element => (
  <div className="flex items-center mb-4">
    <input
      id={name}
      type="checkbox"
      {...register(name)}
      className="h-5 w-5 rounded border-gray-300 text-primary focus:ring-teal"
      {...props}
    />
    <label htmlFor={name} className="ml-2 block text-sm text-gray-900">{label}</label>
  </div>
);

interface SelectProps<T extends FieldValues> extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  name: Path<T>;
  register: UseFormRegister<T>;
  error?: string;
  options: { value: string; label: string }[];
}

export const Select = <T extends FieldValues,>({
  label,
  name,
  register,
  error,
  options,
  ...props
}: SelectProps<T>): React.JSX.Element => (
  <div className="mb-4">
    <label htmlFor={name} className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
    <select
      id={name}
      {...register(name)}
      className="w-full px-4 py-3 border border-primaryLight rounded-2xl bg-white focus:outline-none focus:ring-2 focus:ring-teal focus:border-teal transition-all"
      {...props}
    >
      <option value="">Select an option</option>
      {options.map(option => (
        <option key={option.value} value={option.value}>{option.label}</option>
      ))}
    </select>
    {error && <p className="text-red-500 text-xs mt-1">{error}</p>}
  </div>
);


interface ChoiceChipGroupProps {
    label: string;
    options: string[];
    value: string;
    onChange: (value: string) => void;
    error?: string;
}

export const ChoiceChipGroup: React.FC<ChoiceChipGroupProps> = ({ label, options, value, onChange, error }) => {
    return (
        <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">{label}</label>
            <div className="flex flex-wrap gap-2">
                {options.map(option => (
                    <button
                        key={option}
                        type="button"
                        onClick={() => onChange(option)}
                        className={`px-3 py-2 text-sm rounded-full border transition-colors ${
                            value === option
                                ? 'bg-primary text-white border-primary'
                                : 'bg-white text-gray-700 border-gray-300 hover:bg-pink-50'
                        }`}
                    >
                        {option}
                    </button>
                ))}
            </div>
            {error && <p className="text-red-500 text-xs mt-1">{error}</p>}
        </div>
    );
};
