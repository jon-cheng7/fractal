// BigInt fixed point, for where float64 runs out

/** ~1e-58 */
export const FRAC_BITS = 192;

const SHIFT = BigInt(FRAC_BITS);
const ONE = 1n << SHIFT;
const MANTISSA_BITS = 52n;

const f64 = new Float64Array(1);
const u64 = new BigUint64Array(f64.buffer);

export function fromNumber(x: number): bigint {
    if (!Number.isFinite(x)) throw new RangeError(`Cannot convert ${x}`);
    f64[0] = x;
    const bits = u64[0] ?? 0n;
    const negative = bits >> 63n === 1n;
    const biased = Number((bits >> MANTISSA_BITS) & 0x7ffn);
    const fraction = bits & ((1n << MANTISSA_BITS) - 1n);
    const mantissa = biased === 0 ? fraction : fraction | (1n << MANTISSA_BITS);
    const exponent = (biased === 0 ? -1074 : biased - 1075) + FRAC_BITS;
    const magnitude =
        exponent >= 0 ? mantissa << BigInt(exponent) : mantissa >> BigInt(-exponent);
    return negative ? -magnitude : magnitude;
}

export function toNumber(value: bigint): number {
    return Number(value) / Number(ONE);
}

export function mul(a: bigint, b: bigint): bigint {
    return (a * b) >> SHIFT;
}

export function parse(text: string): bigint {
    const match = /^([+-]?)(\d*)(?:\.(\d*))?$/.exec(text.trim());
    const whole = match?.[2] ?? '';
    const fraction = match?.[3] ?? '';
    if (!match || whole + fraction === '') {
        throw new SyntaxError(`Not a decimal number: ${text}`);
    }
    const digits = BigInt(whole + fraction);
    const magnitude = (digits << SHIFT) / 10n ** BigInt(fraction.length);
    return match[1] === '-' ? -magnitude : magnitude;
}

/** rounds to nearest, round-trips with parse */
export function format(value: bigint, digits = 20): string {
    const negative = value < 0n;
    const magnitude = negative ? -value : value;
    const scaled = (magnitude * 10n ** BigInt(digits) + (ONE >> 1n)) >> SHIFT;
    const text = scaled.toString().padStart(digits + 1, '0');
    const whole = text.slice(0, text.length - digits);
    const fraction = text.slice(text.length - digits);
    return `${negative ? '-' : ''}${whole}${digits > 0 ? `.${fraction}` : ''}`;
}
