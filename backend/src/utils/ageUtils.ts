export const calculateAge = (dob: Date, referenceDate: Date = new Date()): number => {
  let age = referenceDate.getFullYear() - dob.getFullYear();
  const monthDiff = referenceDate.getMonth() - dob.getMonth();

  if (monthDiff < 0 || (monthDiff === 0 && referenceDate.getDate() < dob.getDate())) {
    age--;
  }

  return age;
};

