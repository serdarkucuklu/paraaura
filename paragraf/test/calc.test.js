const { test } = require('node:test');
const assert = require('node:assert/strict');
const { birimAdedi, degerKoruma, yuzdeDegisim } = require('../calc.js');

test('birimAdedi: 1000 TL / 100 = 10 adet', () => {
  assert.equal(birimAdedi(1000, 100), 10);
});
test('birimAdedi: fiyat 0 -> 0 (bolme hatasi yok)', () => {
  assert.equal(birimAdedi(1000, 0), 0);
});
test('degerKoruma: 1000 TL, gecmis 100, guncel 3344 -> 33440', () => {
  assert.equal(degerKoruma(1000, 100, 3344), 33440);
});
test('degerKoruma: gecmisFiyat 0 -> 0', () => {
  assert.equal(degerKoruma(1000, 0, 3344), 0);
});
test('yuzdeDegisim: 1000 -> 2000 = %100', () => {
  assert.equal(yuzdeDegisim(1000, 2000), 100);
});
test('yuzdeDegisim: eski 0 -> 0', () => {
  assert.equal(yuzdeDegisim(0, 100), 0);
});
