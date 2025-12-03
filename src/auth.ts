import jwt from "jsonwebtoken";
import { signatureVerify } from "@polkadot/util-crypto";
import { z } from "zod";
import { randomUUID } from "node:crypto"; 

export const nonceStore = new Map<string, number>();

export function issueNonce(ttlSec: number) {
  const nonce = randomUUID();
  nonceStore.set(nonce, Date.now() + ttlSec * 1000);
  return nonce;
}

export function consumeNonce(nonce: string) {
  const exp = nonceStore.get(nonce);
  if (!exp) return false;
  nonceStore.delete(nonce);
  return exp > Date.now();
}

export function verifySignature(address: string, message: string, signature: string) {
  const { isValid } = signatureVerify(message, signature, address);
  return isValid;
}

export function signJwt(address: string, ttlMin: number, secret: string) {
  return jwt.sign({ sub: address, hasAccess: true }, secret, { expiresIn: `${ttlMin}m` });
}

export const SignedMessageSchema = z.object({
  address: z.string().min(3),
  message: z.string().min(5),
  signature: z.string().min(10)
});

export function extractLine(message: string, key: string) {
  const line = message.split("\n").find(l => l.startsWith(`${key}:`));
  return line?.split(":").slice(1).join(":").trim() || "";
}
