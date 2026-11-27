
export const capitalizeWords = (str: string): string => {
  if (!str) return '';
  return str.replace(/\b\w/g, char => char.toUpperCase());
};

export const formatPhoneNumber = (value: string): string => {
  if (!value) return '';
  let phoneNumber = value.replace(/[^\d]/g, '');
  // +63 917 123 4567 → 0917 123 4567 (it used to keep only 11 digits and drop the last one)
  if (phoneNumber.length === 12 && phoneNumber.startsWith('639')) phoneNumber = `0${phoneNumber.slice(2)}`;
  const phoneNumberLength = phoneNumber.length;

  if (phoneNumberLength < 5) return phoneNumber;
  if (phoneNumberLength < 8) {
    return `${phoneNumber.slice(0, 4)} ${phoneNumber.slice(4)}`;
  }
  // Longer numbers (e.g. from abroad) keep every digit.
  const rest = phoneNumber.slice(11);
  return `${phoneNumber.slice(0, 4)} ${phoneNumber.slice(4, 7)} ${phoneNumber.slice(7, 11)}${rest ? ` ${rest}` : ''}`;
};
