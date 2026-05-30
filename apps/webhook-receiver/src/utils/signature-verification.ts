import { createHmac } from "node:crypto";

/**
 * Verify MSG91 webhook signature
 * MSG91 uses: HMAC-SHA256 of DLR data with API key as secret
 */
export function verifyMsg91Signature(
  payload: string,
  signature: string,
  apiKey: string,
): boolean {
  const hmac = createHmac("sha256", apiKey);
  hmac.update(payload);
  const expectedSignature = hmac.digest("hex");
  return signature === expectedSignature;
}

/**
 * Verify Meta (WhatsApp) webhook signature
 * Meta uses: HMAC-SHA256 of body with token as secret, compared with X-Hub-Signature header
 */
export function verifyMetaSignature(
  payload: string,
  signature: string,
  token: string,
): boolean {
  const hmac = createHmac("sha256", token);
  hmac.update(payload);
  const expectedSignature = `sha256=${hmac.digest("hex")}`;
  return signature === expectedSignature;
}

/**
 * Verify AWS SES webhook signature
 * SES uses SNS with certificate validation - typically done at SNS level
 * For now, we'll do a simple token validation
 */
export function verifySesSignature(
  payload: string,
  signature: string,
  secret: string,
): boolean {
  const hmac = createHmac("sha256", secret);
  hmac.update(payload);
  const expectedSignature = hmac.digest("hex");
  return signature === expectedSignature;
}

/**
 * Verify Exotel webhook signature
 * Exotel uses: HMAC-SHA256 of body with API token as secret
 */
export function verifyExotelSignature(
  payload: string,
  signature: string,
  apiToken: string,
): boolean {
  const hmac = createHmac("sha256", apiToken);
  hmac.update(payload);
  const expectedSignature = hmac.digest("hex");
  return signature === expectedSignature;
}
