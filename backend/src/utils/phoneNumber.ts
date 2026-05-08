const PHONE_REGEX = /^\+?\d{9,15}$/;

export const PHONE_VALIDATION_MESSAGE = 'Please enter a valid contact number, e.g. +263771234567.';

export function isValidPhoneNumber(phoneNumber: string | null | undefined): boolean {
  if (!phoneNumber) {
    return false;
  }
  return PHONE_REGEX.test(phoneNumber);
}


