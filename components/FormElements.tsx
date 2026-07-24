import React from 'react';
import type { UseFormRegister, FieldValues, Path, RegisterOptions } from 'react-hook-form';
import { capitalizeWords, formatPhoneNumber } from '../utils/helpers';

type InputProps<T extends FieldValues> = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'name'> & {
  label: string;
  name: Path<T>;
  register: UseFormRegister<T>;
  rules?: RegisterOptions<T, Path<T>>;
  error?: string;
  isPhoneNumber?: boolean;
  isCapitalized?: boolean;
};

export const Input = <T extends FieldValues,>({
  label,
  name,
  register,
  rules,
  error,
  type = 'text',
  isPhoneNumber = false,
  isCapitalized = false,
  ...props
}: InputProps<T>): React.JSX.Element => {
  const { onChange, ...rest } = register(name, rules);

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
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${name}-error` : undefined}
        className={`w-full px-4 py-3 border rounded-2xl focus:outline-none focus:ring-2 focus:ring-teal focus:border-teal transition-all ${
          error ? 'border-red-500' : 'border-primaryLight'
        }`}
        {...props}
      />
      {error && <p id={`${name}-error`} className="text-red-500 text-xs mt-1" role="alert">{error}</p>}
    </div>
  );
};

type TextareaProps<T extends FieldValues> = Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, 'name'> & {
  label: string;
  name: Path<T>;
  register: UseFormRegister<T>;
  rules?: RegisterOptions<T, Path<T>>;
  error?: string;
};

export const Textarea = <T extends FieldValues,>({
  label,
  name,
  register,
  rules,
  error,
  ...props
}: TextareaProps<T>): React.JSX.Element => (
  <div className="mb-4">
    <label htmlFor={name} className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
    <textarea
      id={name}
      {...register(name, rules)}
      aria-invalid={Boolean(error)}
      aria-describedby={error ? `${name}-error` : undefined}
      className={`w-full px-4 py-3 border rounded-2xl focus:outline-none focus:ring-2 focus:ring-teal focus:border-teal transition-all ${
        error ? 'border-red-500' : 'border-primaryLight'
      }`}
      rows={3}
      {...props}
    />
    {error && <p id={`${name}-error`} className="text-red-500 text-xs mt-1" role="alert">{error}</p>}
  </div>
);

type CheckboxProps<T extends FieldValues> = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'name'> & {
  label: React.ReactNode;
  name: Path<T>;
  register: UseFormRegister<T>;
  rules?: RegisterOptions<T, Path<T>>;
};

export const Checkbox = <T extends FieldValues,>({
  label,
  name,
  register,
  rules,
  ...props
}: CheckboxProps<T>): React.JSX.Element => (
  <div className="flex items-center mb-4">
    <input
      id={name}
      type="checkbox"
      {...register(name, rules)}
      className="h-5 w-5 rounded border-gray-300 text-primary focus:ring-teal"
      {...props}
    />
    <label htmlFor={name} className="ml-2 block text-sm text-gray-900">{label}</label>
  </div>
);

type SelectProps<T extends FieldValues> = Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'name'> & {
  label: string;
  name: Path<T>;
  register: UseFormRegister<T>;
  rules?: RegisterOptions<T, Path<T>>;
  error?: string;
  options: { value: string; label: string }[];
};

export const Select = <T extends FieldValues,>({
  label,
  name,
  register,
  rules,
  error,
  options,
  ...props
}: SelectProps<T>): React.JSX.Element => (
  <div className="mb-4">
    <label htmlFor={name} className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
    <select
      id={name}
      {...register(name, rules)}
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
    id: string;
    label: string;
    options: string[];
    value: string;
    onChange: (value: string) => void;
    error?: string;
    inputRef?: React.Ref<HTMLDivElement>;
}

export const ChoiceChipGroup: React.FC<ChoiceChipGroupProps> = ({ id, label, options, value, onChange, error, inputRef }) => {
    return (
        <div
            id={id}
            ref={inputRef}
            className={`mb-4 rounded-2xl ${error ? 'ring-2 ring-red-500 p-2 -m-2 mb-2' : ''}`}
            tabIndex={-1}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? `${id}-error` : undefined}
        >
            <div className="block text-sm font-medium text-gray-700 mb-2">{label}</div>
            <div className="flex flex-wrap gap-2">
                {options.map(option => (
                    <button
                        key={option}
                        type="button"
                        onClick={() => onChange(option)}
                        aria-pressed={value === option}
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
            {error && <p id={`${id}-error`} className="text-red-500 text-xs mt-1" role="alert">{error}</p>}
        </div>
    );
};
