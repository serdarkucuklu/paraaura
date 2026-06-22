/* ParaGraf saf hesaplamalar. Tarayicida classic <script> (window.ParaGrafCalc),
   Node'da CommonJS (module.exports) — paragraf icinde package.json yok, .js = CJS. */
(function (global) {
  'use strict';

  function birimAdedi(tutar, fiyat) {
    return (typeof fiyat === 'number' && fiyat > 0) ? tutar / fiyat : 0;
  }

  function degerKoruma(tutar, gecmisFiyat, guncelFiyat) {
    if (!(typeof gecmisFiyat === 'number' && gecmisFiyat > 0)) return 0;
    return (tutar / gecmisFiyat) * guncelFiyat;
  }

  function yuzdeDegisim(eski, yeni) {
    return (typeof eski === 'number' && eski > 0) ? ((yeni - eski) / eski) * 100 : 0;
  }

  // Seyrek yillik veride (2005/2008/2010...) ara yillar icin lineer interpolasyon.
  // Onceden eksik yil sessizce 2015'e dusuyordu (yaniltici). Snir disinda en yakin uca kelepcelenir.
  function interpoleYil(yillar, yil) {
    var y = parseInt(yil, 10);
    if (yillar[String(y)]) return yillar[String(y)];
    var keys = Object.keys(yillar).map(Number).sort(function (a, b) { return a - b; });
    if (!keys.length) return null;
    if (y <= keys[0]) return yillar[String(keys[0])];
    if (y >= keys[keys.length - 1]) return yillar[String(keys[keys.length - 1])];
    var lo = keys[0], hi = keys[keys.length - 1];
    for (var i = 0; i < keys.length - 1; i++) {
      if (keys[i] <= y && y <= keys[i + 1]) { lo = keys[i]; hi = keys[i + 1]; break; }
    }
    var a = yillar[String(lo)], b = yillar[String(hi)], t = (y - lo) / (hi - lo), out = {};
    Object.keys(a).forEach(function (k) { out[k] = a[k] + (b[k] - a[k]) * t; });
    return out;
  }

  var api = { birimAdedi: birimAdedi, degerKoruma: degerKoruma, yuzdeDegisim: yuzdeDegisim, interpoleYil: interpoleYil };

  if (typeof window !== 'undefined') global.ParaGrafCalc = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : this);
