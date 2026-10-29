import CryptoJS from "crypto-js";

function encryptionKey(): string {
  const key = process.env.ENCRYPTION_KEY;
  if (!key || key.length < 32)
    throw new Error("ENCRYPTION_KEY must contain at least 32 characters.");
  return key;
}

export function encrypt(text: string): string {
  return CryptoJS.AES.encrypt(text, encryptionKey()).toString();
}

export function decrypt(ciphertext: string): string {
  const bytes = CryptoJS.AES.decrypt(ciphertext, encryptionKey());
  return bytes.toString(CryptoJS.enc.Utf8);
}
