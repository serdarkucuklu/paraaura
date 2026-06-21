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

  var api = { birimAdedi: birimAdedi, degerKoruma: degerKoruma, yuzdeDegisim: yuzdeDegisim };

  if (typeof window !== 'undefined') global.ParaGrafCalc = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : this);
