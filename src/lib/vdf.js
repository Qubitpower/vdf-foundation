// A toy Verifiable Delay Function — repeated squaring in Z_N* for a
// demo-sized RSA modulus, with a Wesolowski proof — built and checked with
// only the browser's native BigInt and Web Crypto API. See /how-it-works for
// the formulas this implements, and the two things it is honest about:
// there is no real trusted setup here (this file generates its own p, q,
// which defeats the entire point in a real deployment — see below), and
// proof generation is the direct, unoptimized computation, not the
// production speedups real systems use.

const enc = new TextEncoder();

function randomBigIntBits(bits) {
  const byteLen = Math.ceil(bits / 8);
  const bytes = new Uint8Array(byteLen);
  crypto.getRandomValues(bytes);
  // Trim to exactly `bits` bits, force the top bit set (so it's exactly this
  // many bits) and the bottom bit set (odd — useful for candidate primes).
  const excessBits = byteLen * 8 - bits;
  bytes[0] &= 0xff >> excessBits;
  bytes[0] |= 0x80 >> excessBits;
  bytes[byteLen - 1] |= 1;
  let n = 0n;
  for (const b of bytes) n = (n << 8n) | BigInt(b);
  return n;
}

/**
 * Modular exponentiation, safe for exponents with millions of bits: bits are
 * extracted once via toString(2) rather than repeatedly right-shifting the
 * (potentially huge) exponent — shifting a shrinking-but-still-huge BigInt
 * bit by bit in a loop is quadratic, not linear, in the exponent's bit
 * length, which matters a lot once T reaches the millions this demo uses.
 */
export function modPow(base, exp, mod) {
  base %= mod;
  if (base < 0n) base += mod;
  if (exp === 0n) return 1n % mod;
  const bits = exp.toString(2);
  let result = 1n;
  for (let i = 0; i < bits.length; i++) {
    result = (result * result) % mod;
    if (bits[i] === '1') result = (result * base) % mod;
  }
  return result;
}

const SMALL_PRIMES = [2n, 3n, 5n, 7n, 11n, 13n, 17n, 19n, 23n, 29n, 31n, 37n, 41n, 43n, 47n];

/** Miller–Rabin primality test. */
export function isProbablePrime(n, rounds = 20) {
  if (n < 2n) return false;
  for (const p of SMALL_PRIMES) {
    if (n === p) return true;
    if (n % p === 0n) return false;
  }
  let d = n - 1n;
  let r = 0n;
  while (d % 2n === 0n) {
    d /= 2n;
    r += 1n;
  }
  const byteLen = (n.toString(2).length + 7) >> 3;
  witnessLoop: for (let i = 0; i < rounds; i++) {
    const bytes = new Uint8Array(byteLen);
    crypto.getRandomValues(bytes);
    let a = 0n;
    for (const b of bytes) a = (a << 8n) | BigInt(b);
    a = (a % (n - 3n)) + 2n;
    let x = modPow(a, d, n);
    if (x === 1n || x === n - 1n) continue;
    for (let j = 0n; j < r - 1n; j++) {
      x = (x * x) % n;
      if (x === n - 1n) continue witnessLoop;
    }
    return false;
  }
  return true;
}

function generatePrime(bits) {
  while (true) {
    const candidate = randomBigIntBits(bits);
    if (isProbablePrime(candidate)) return candidate;
  }
}

/**
 * Generate a demo-sized RSA modulus N = p*q client-side, right here in your
 * browser. This is NOT a trusted setup — see /how-it-works for why
 * generating your own p and q defeats the entire purpose in a real
 * deployment. It's here purely so the demo has a group of unknown order to
 * work in without needing a server.
 */
export function generateDemoModulus(totalBits = 512) {
  const half = totalBits / 2;
  const p = generatePrime(half);
  const q = generatePrime(half);
  return { N: p * q, p, q };
}

async function sha256ToBigInt(bytes) {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  let n = 0n;
  for (const b of new Uint8Array(digest)) n = (n << 8n) | BigInt(b);
  return n;
}

/**
 * ell = hash_to_prime(x, y, T): hash the statement to a field element, then
 * search upward for a prime (checking primality with Miller-Rabin). Prover
 * and verifier both compute this the same way, so it never has to be sent.
 */
export async function hashToPrime(x, y, T, primeBits = 128) {
  let counter = 0;
  while (true) {
    const input = enc.encode(`${x.toString(16)}|${y.toString(16)}|${T.toString()}|${counter}`);
    let h = await sha256ToBigInt(input);
    h %= 1n << BigInt(primeBits);
    h |= 1n << BigInt(primeBits - 1); // force exactly primeBits bits
    h |= 1n; // force odd
    if (isProbablePrime(h)) return h;
    counter++;
  }
}

async function yieldToBrowser() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * @typedef {{ done: bigint | number, total: bigint | number, elapsedMs: number }} VdfProgress
 */

/**
 * Eval: y = x^(2^T) mod N via T sequential squarings. Yields to the browser
 * event loop periodically (instead of running as one long synchronous loop)
 * so onProgress can actually repaint a live counter/timer while this runs,
 * and so the tab doesn't freeze.
 * @param {bigint} x
 * @param {bigint} T
 * @param {bigint} N
 * @param {(progress: VdfProgress) => void} [onProgress]
 * @returns {Promise<bigint>}
 */
export async function evalVDF(x, T, N, onProgress) {
  let y = x;
  let i = 0n;
  let lastYield = performance.now();
  const start = performance.now();
  while (i < T) {
    y = (y * y) % N;
    i++;
    if (performance.now() - lastYield > 50) {
      onProgress?.({ done: i, total: T, elapsedMs: performance.now() - start });
      await yieldToBrowser();
      lastYield = performance.now();
    }
  }
  onProgress?.({ done: T, total: T, elapsedMs: performance.now() - start });
  return y;
}

/**
 * modPow, but yielding periodically — used for the proof's pi = x^q mod N,
 * where q can have millions of bits at demo-scale T. This is the "simplified
 * proof generation" from /how-it-works: computing pi this directly costs
 * roughly as much sequential work as Eval did, which is exactly why
 * production systems use smarter techniques instead.
 * @param {bigint} base
 * @param {bigint} exp
 * @param {bigint} mod
 * @param {(progress: VdfProgress) => void} [onProgress]
 * @returns {Promise<bigint>}
 */
async function chunkedModPow(base, exp, mod, onProgress) {
  base %= mod;
  if (base < 0n) base += mod;
  if (exp === 0n) return 1n % mod;
  const bits = exp.toString(2);
  let result = 1n;
  let lastYield = performance.now();
  const start = performance.now();
  for (let i = 0; i < bits.length; i++) {
    result = (result * result) % mod;
    if (bits[i] === '1') result = (result * base) % mod;
    if (performance.now() - lastYield > 50) {
      onProgress?.({ done: i + 1, total: bits.length, elapsedMs: performance.now() - start });
      await yieldToBrowser();
      lastYield = performance.now();
    }
  }
  onProgress?.({ done: bits.length, total: bits.length, elapsedMs: performance.now() - start });
  return result;
}

/**
 * Wesolowski proof: ell = hash_to_prime(x,y,T); q = floor(2^T / ell);
 * r = 2^T mod ell (fast — small exponent T, not T steps);
 * pi = x^q mod N (the expensive part at demo scale — see chunkedModPow).
 * @param {bigint} x
 * @param {bigint} y
 * @param {bigint} T
 * @param {bigint} N
 * @param {(progress: VdfProgress) => void} [onProgress]
 */
export async function proveVDF(x, y, T, N, onProgress) {
  const ell = await hashToPrime(x, y, T);
  const twoT = 1n << T;
  const q = twoT / ell;
  const r = modPow(2n, T, ell);
  const pi = await chunkedModPow(x, q, N, onProgress);
  return { pi, ell, r };
}

/**
 * Verify: recompute ell and r the same way, check
 * y == pi^ell * x^r (mod N). No T-step loop anywhere — fast regardless of T.
 */
export async function verifyVDF(x, y, T, N, pi, ell) {
  const ellCheck = await hashToPrime(x, y, T);
  if (ellCheck !== ell) return false;
  const r = modPow(2n, T, ell);
  const lhs = ((y % N) + N) % N;
  const rhs = (modPow(pi, ell, N) * modPow(x, r, N)) % N;
  return lhs === rhs;
}
