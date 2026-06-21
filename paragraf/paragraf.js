(function () {
  "use strict";
  const PG = window.ParaGrafCalc;
  const fmt = new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 1 });
  const fmtTL = (v) => new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 0 }).format(v);

  const CEYREK_GRAM = 1.6; // 1 ceyrek altin ~ 1.6 gram (yaklasik)
  let data = null;        // paragraf_data.json
  let guncel = null;      // {gram_altin, usd, eur, ekmek, benzin, asgari_ucret_net}
  let chart = null;

  const $ = (id) => document.getElementById(id);

  async function init() {
    try {
      data = await (await fetch("../paragraf_data.json", { cache: "no-store" })).json();
    } catch (e) { console.error("veri yuklenemedi", e); return; }
    guncel = await buildGuncel();
    $("yil-input").addEventListener("input", render);
    $("tutar-input").addEventListener("input", render);
    $("share-btn").addEventListener("click", paylas);
    render();
  }

  // Guncel (2026) degerler: canli rates.json'dan altin/usd/eur; gida/asgari paragraf_data'dan.
  async function buildGuncel() {
    const son = data.yillar["2025"];
    const g = { gram_altin: son.gram_altin, usd: son.usd, eur: son.eur, ekmek: son.ekmek, benzin: son.benzin, asgari_ucret_net: son.asgari_ucret_net };
    try {
      const r = await (await fetch("../rates.json", { cache: "no-store" })).json();
      if (r && r.metals) {
        const gram = r.metals.find((m) => (m.name || "").toLowerCase().includes("gram"));
        if (gram) { const v = parseFloat(String(gram.price).replace(/[^0-9.,]/g, "").replace(",", ".")); if (v > 0) g.gram_altin = v; }
      }
    } catch (e) { /* canli veri yoksa 2025 degerleriyle devam */ }
    return g;
  }

  function satir(label, gecmisAdet, bugunAdet, birim) {
    return `<div class="pg-row"><span>${label}</span><span class="pg-num">${fmt.format(gecmisAdet)} ${birim} <span style="color:var(--text-muted)">→ bugün</span> <strong style="color:var(--down)">${fmt.format(bugunAdet)} ${birim}</strong></span></div>`;
  }

  function render() {
    const yil = $("yil-input").value;
    $("yil-label").textContent = yil;
    const tutar = Math.max(0, parseFloat($("tutar-input").value) || 0);
    const gec = data.yillar[yil] || data.yillar["2015"];

    // o gunku adetler vs bugunku adetler (ayni tutar)
    const ceyrekGec = PG.birimAdedi(tutar, gec.gram_altin * CEYREK_GRAM);
    const ceyrekBug = PG.birimAdedi(tutar, guncel.gram_altin * CEYREK_GRAM);
    const usdGec = PG.birimAdedi(tutar, gec.usd), usdBug = PG.birimAdedi(tutar, guncel.usd);
    const ekmekGec = PG.birimAdedi(tutar, gec.ekmek), ekmekBug = PG.birimAdedi(tutar, guncel.ekmek);
    const asgGec = PG.birimAdedi(tutar, gec.asgari_ucret_net), asgBug = PG.birimAdedi(tutar, guncel.asgari_ucret_net);

    $("sonuc-gecmis").innerHTML =
      `<h3 class="section-title" style="font-size:1.1rem">${fmtTL(tutar)} (${yil}) ne alırdı → bugün ne alır?</h3>` +
      satir("Çeyrek altın", ceyrekGec, ceyrekBug, "adet") +
      satir("Dolar (USD)", usdGec, usdBug, "$") +
      satir("Ekmek", ekmekGec, ekmekBug, "adet") +
      satir("Asgari ücret", asgGec, asgBug, "maaş");

    // Deger koruma: o tutari altinda/dolarda tutsaydin bugun ne olurdu
    const altinBugun = PG.degerKoruma(tutar, gec.gram_altin, guncel.gram_altin);
    const dolarBugun = PG.degerKoruma(tutar, gec.usd, guncel.usd);
    $("deger-koruma").innerHTML =
      `<h3 class="section-title" style="font-size:1.1rem">O ${fmtTL(tutar)}'yi saklasaydın?</h3>` +
      `<div class="pg-row"><span>Altında tutsaydın</span><strong class="pg-num" style="color:var(--up)">${fmtTL(altinBugun)} <span style="color:var(--text-muted)">(%${fmt.format(PG.yuzdeDegisim(tutar, altinBugun))})</span></strong></div>` +
      `<div class="pg-row"><span>Dolarda tutsaydın</span><strong class="pg-num" style="color:var(--up)">${fmtTL(dolarBugun)} <span style="color:var(--text-muted)">(%${fmt.format(PG.yuzdeDegisim(tutar, dolarBugun))})</span></strong></div>` +
      `<div class="pg-row"><span>TL'de tuttuysan</span><strong class="pg-num">${fmtTL(tutar)} <span style="color:var(--down)">(reel kayıp)</span></strong></div>`;

    cizGrafik(tutar);
    guncelleKart(yil, tutar, ceyrekGec, ceyrekBug, ekmekGec, ekmekBug, usdGec, usdBug, altinBugun);
  }

  function cizGrafik(tutar) {
    const yillar = Object.keys(data.yillar).sort();
    const altinAdet = yillar.map((y) => PG.birimAdedi(tutar, data.yillar[y].gram_altin)); // tutarin gram altin cinsinden erimesi
    if (typeof Chart === "undefined") return;
    const ctx = $("paragraf-chart").getContext("2d");
    if (chart) chart.destroy();
    chart = new Chart(ctx, {
      type: "line",
      data: { labels: yillar, datasets: [{ label: `${fmtTL(tutar)} kaç gram altın eder?`, data: altinAdet, borderColor: "#d4b572", backgroundColor: "rgba(212,181,114,.15)", fill: true, tension: .3, pointRadius: 0 }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { color: "#9aa0ab" } } }, scales: { x: { ticks: { color: "#9aa0ab" }, grid: { display: false } }, y: { ticks: { color: "#9aa0ab" }, grid: { color: "rgba(212,181,114,.1)" } } } }
    });
  }

  function guncelleKart(yil, tutar, ceyrekGec, ceyrekBug, ekmekGec, ekmekBug, usdGec, usdBug, altinBugun) {
    const line = (label, val) => `<div class="sc-line"><span>${label}</span><b>${val}</b></div>`;
    $("kart-yil-baslik").textContent = `${yil} → 2026`;
    $("kart-amount").textContent = `${fmtTL(tutar)} ne oldu?`;
    $("kart-hero-label").textContent = `O ${fmtTL(tutar)}'yi altında saklasaydın bugün`;
    $("kart-hero-big").textContent = fmtTL(altinBugun);
    $("kart-satirlar").innerHTML =
      line("🪙 Çeyrek altın", `${fmt.format(ceyrekGec)} → ${fmt.format(ceyrekBug)}`) +
      line("🍞 Ekmek", `${fmt.format(ekmekGec)} → ${fmt.format(ekmekBug)}`) +
      line("💵 Dolar", `${fmt.format(usdGec)} → ${fmt.format(usdBug)}`);
  }

  async function ensureHtml2Canvas() {
    if (typeof html2canvas !== "undefined") return;
    await new Promise((res, rej) => {
      const s = document.createElement("script");
      s.src = "https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js";
      s.onload = res; s.onerror = () => rej(new Error("html2canvas yüklenemedi (ağ/engel)."));
      document.head.appendChild(s);
    });
  }

  async function paylas() {
    const btn = $("share-btn");
    const eski = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i> Hazırlanıyor...';
    try {
      await ensureHtml2Canvas();
      const card = $("share-card");
      const canvas = await html2canvas(card, {
        backgroundColor: "#0d0f13", scale: 2, useCORS: true, logging: false,
        width: 1080, height: 1350, windowWidth: 1080, windowHeight: 1350,
      });
      const blob = await new Promise((res) => canvas.toBlob(res, "image/png"));
      if (!blob) throw new Error("Görsel oluşturulamadı (toBlob boş döndü).");
      const file = new File([blob], "paragraf.png", { type: "image/png" });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: "ParaGraf", text: "Paran eridi mi? kuraura.com.tr/paragraf" });
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.download = "paragraf.png"; a.href = url;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 4000);
      }
    } catch (e) {
      // Sessiz basarisizlik YOK: hatayi kullaniciya goster.
      console.error("paylasim hatasi", e);
      if (!(e && e.name === "AbortError")) { // kullanici share dialogunu iptal ettiyse uyari gosterme
        alert("Kart oluşturulamadı: " + (e && e.message ? e.message : e));
      }
    } finally {
      btn.disabled = false; btn.innerHTML = eski;
    }
  }

  init();
})();
