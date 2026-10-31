// Fixed-point tests

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { format, fromNumber, mul, parse, toNumber } from './fixed.ts';

function relativeError(actual: number, expected: number): number {
    return Math.abs(actual - expected) / Math.abs(expected);
}

describe('fixed', () => {
    it('round-trips ordinary numbers exactly', () => {
        for (const x of [0, 1, -1, 0.5, -0.743643887037151, 1234.5678]) {
            assert.equal(toNumber(fromNumber(x)), x);
        }
    });

    it('keeps full precision for numbers far below float64 resolution near 1', () => {
        for (const x of [4.7e-33, -1e-30, 2.5e-40]) {
            assert.ok(relativeError(toNumber(fromNumber(x)), x) < 1e-15);
        }
    });

    it('rejects values it cannot represent', () => {
        assert.throws(() => fromNumber(Infinity));
        assert.throws(() => fromNumber(NaN));
    });

    it('multiplies like real numbers', () => {
        const product = mul(fromNumber(-1.5), fromNumber(0.25));
        assert.equal(toNumber(product), -0.375);
        const small = mul(fromNumber(1e-20), fromNumber(1e-20));
        assert.ok(relativeError(toNumber(small), 1e-40) < 1e-12);
    });

    it('parses and formats decimals without losing digits', () => {
        const text = '-0.743643887037158704752191506114774';
        assert.equal(format(parse(text), 33), text);
        assert.equal(format(parse('1'), 5), '1.00000');
        assert.equal(format(parse('0.000000000000000000000000000001'), 30), '0.000000000000000000000000000001');
    });

    it('rejects text that is not a decimal', () => {
        assert.throws(() => parse('abc'));
        assert.throws(() => parse(''));
        assert.throws(() => parse('1e5'));
    });
});
