import { z } from 'zod';

/**
 * The push services of the browsers the owner may use (T-033e): Chrome, Samsung Internet and
 * Opera (Google), Firefox (Mozilla), Safari on iPhone and Mac (Apple), Edge (Microsoft). The
 * server posts to a subscription's endpoint, so any other host is refused: the shop server never
 * becomes a way to reach an address of someone's choosing.
 */
const PUSH_SERVICE_HOST =
  /^(fcm\.googleapis\.com|[a-z0-9.-]+\.push\.services\.mozilla\.com|[a-z0-9.-]+\.push\.apple\.com|[a-z0-9.-]+\.notify\.windows\.com)$/;
/** A bare host then a path: no port, no credentials. */
const BARE_HOST = /^https:\/\/[A-Za-z0-9.-]+\//;
const knownEndpoint = z
  .string()
  .regex(BARE_HOST)
  .pipe(z.url({ protocol: /^https$/, hostname: PUSH_SERVICE_HOST }));

/** The endpoint is an `https` address of a known push service, on its default port. */
export const isKnownPushService = (endpoint: string): boolean =>
  knownEndpoint.safeParse(endpoint).success;

/** Unpadded base64url of a fixed length; a padding the browser may add is dropped. */
const base64url = (chars: number) =>
  z
    .string()
    .transform((value) => value.replace(/=+$/, ''))
    .pipe(z.string().regex(new RegExp(`^[A-Za-z0-9_-]{${chars}}$`)));

const endpoint = z
  .string()
  .max(2048)
  .pipe(z.url({ protocol: /^https$/ }));

/**
 * A device's subscription, as `PushSubscription.toJSON()` gives it: the push service's endpoint
 * and the keys the payload is encrypted with (RFC 8291) — a P-256 point (65 bytes) and a 16-byte
 * secret.
 */
export const pushSubscriptionSchema = z.object({
  endpoint,
  keys: z.object({ p256dh: base64url(87), auth: base64url(22) }),
});
export type PushSubscriptionInput = z.input<typeof pushSubscriptionSchema>;

/** One device, by its endpoint: turned off, or sent a test. */
export const pushEndpointSchema = z.object({ endpoint });
export type PushEndpoint = z.infer<typeof pushEndpointSchema>;

/** The server's VAPID public key (RFC 8292), null when push is not configured. */
export const pushKeySchema = z.object({ publicKey: z.string().nullable() });
export type PushKey = z.infer<typeof pushKeySchema>;

/** What the service worker shows: composed by the server, in French. */
export const pushMessageSchema = z.object({
  title: z.string(),
  body: z.string(),
  /** One notification per request: a new one replaces it rather than piling up. */
  tag: z.string(),
  /** The app's page a tap opens, on the app's own origin. */
  url: z.string().startsWith('/'),
});
export type PushMessage = z.infer<typeof pushMessageSchema>;
