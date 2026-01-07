import bcrypt from "bcryptjs";

export const hashOtp = async (otp: string) => {
  return bcrypt.hash(otp, 10);
};

export const compareOtp = async (otp: string, hash: string) => {
  return bcrypt.compare(otp, hash);
};

export const generateOtp = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

export const otpExpiry = () => {
  return new Date(Date.now() + 5 * 60 * 1000);
};
