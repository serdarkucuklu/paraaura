const { test } = require('node:test');
const assert = require('node:assert/strict');
const { birimAdedi, degerKoruma, yuzdeDegisim, interpoleYil } = require('../calc.js');

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

const Y = { '2010': { gram_altin: 60, usd: 1.5 }, '2020': { gram_altin: 400, usd: 7 } };
test('interpoleYil: mevcut yil aynen doner', () => {
  assert.deepEqual(interpoleYil(Y, '2010'), Y['2010']);
});
test('interpoleYil: 2015 ortada -> lineer (gram 230, usd 4.25)', () => {
  const r = interpoleYil(Y, 2015);
  assert.equal(r.gram_altin, 230);
  assert.equal(r.usd, 4.25);
});
test('interpoleYil: sinir disi alt -> en kucuk yil', () => {
  assert.deepEqual(interpoleYil(Y, 2000), Y['2010']);
});
test('interpoleYil: sinir disi ust -> en buyuk yil', () => {
  assert.deepEqual(interpoleYil(Y, 2099), Y['2020']);
});
