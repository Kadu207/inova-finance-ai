const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32Decode(input: string): Uint8Array {
  const cleaned = input.replace(/=+$/, "").toUpperCase();
  let bits = 0;
  let value = 0;
  const output: number[] = [];
  for (const char of cleaned) {
    const idx = BASE32.indexOf(char);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return new Uint8Array(output);
}

function intToBytes(num: number): Uint8Array {
  const buf = new ArrayBuffer(8);
  new DataView(buf).setUint32(4, num);
  return new Uint8Array(buf).slice(4);
}

async function hotp(secret: Uint8Array, counter: number): Promise<string> {
  const key = await crypto.subtle.importKey("raw", secret, { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, intToBytes(counter)));
  const offset = sig[sig.length - 1]! & 0x0f;
  const code =
    (((sig[offset]! & 0x7f) << 24) |
      ((sig[offset + 1]! & 0xff) << 16) |
      ((sig[offset + 2]! & 0xff) << 8) |
      (sig[offset + 3]! & 0xff)) %
    1_000_000;
  return code.toString().padStart(6, "0");
}

export function generateTotpSecret(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(20));
  let result = "";
  for (let i = 0; i < bytes.length; i++) {
    result += BASE32[bytes[i]! % 32];
  }
  return result;
}

export function buildTotpUri(secret: string, email: string): string {
  return `otpauth://totp/InovaFinanceAI:${encodeURIComponent(email)}?secret=${secret}&issuer=InovaFinanceAI`;
}

/** Gera o código TOTP corrente para o segredo (contraparte de `verifyTotp`). */
export async function generateTotp(secret: string): Promise<string> {
  const counter = Math.floor(Date.now() / 1000 / 30);
  return hotp(base32Decode(secret), counter);
}

export async function verifyTotp(secret: string, token: string, window = 1): Promise<boolean> {
  const decoded = base32Decode(secret);
  const counter = Math.floor(Date.now() / 1000 / 30);
  for (let w = -window; w <= window; w++) {
    const expected = await hotp(decoded, counter + w);
    if (expected === token) return true;
  }
  return false;
}
