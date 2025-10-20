
export const capitalizeWords = (str: string): string => {
  if (!str) return '';
  return str.replace(/\b\w/g, char => char.toUpperCase());
};

export const formatPhoneNumber = (value: string): string => {
  if (!value) return '';
  const phoneNumber = value.replace(/[^\d]/g, '');
  const phoneNumberLength = phoneNumber.length;

  if (phoneNumberLength < 5) return phoneNumber;
  if (phoneNumberLength < 8) {
    return `${phoneNumber.slice(0, 4)} ${phoneNumber.slice(4)}`;
  }
  return `${phoneNumber.slice(0, 4)} ${phoneNumber.slice(4, 7)} ${phoneNumber.slice(7, 11)}`;
};
