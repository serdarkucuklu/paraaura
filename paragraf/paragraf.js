(function () {
  "use strict";
  const PG = window.ParaGrafCalc;
  const NV = window.NobleVision;
  const fmt = new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 1 });
  const fmtTL = (v) => new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 0 }).format(v);

  const CEYREK_GRAM = 1.6; // 1 ceyrek altin ~ 1.6 gram (yaklasik)
  let data = null;        // paragraf_data.json
  let guncel = null;      // {gram_altin, usd, eur, ekmek, benzin, asgari_ucret_net}
  let chart = null;
  let lastObjectUrl = null;

  const $ = (id) => document.getElementById(id);

  async function init() {
    // Listener'lari ONCE bagla (veri yuklenmese bile butonlar olu kalmasin).
    $("yil-input").addEventListener("input", onYil);
    $("tutar-input").addEventListener("input", render);
    $("share-btn").addEventListener("click", paylas);
    initChips();
    initModal();

    try {
      data = await (await fetch("../paragraf_data.json", { cache: "no-store" })).json();
    } catch (e) {
      console.error("veri yuklenemedi", e);
      $("results-title").textContent = "Veri yüklenemedi — lütfen sayfayı yenileyin.";
      if (NV) NV.toast("Veri yüklenemedi, tekrar deneyin.", "down");
      return;
    }
    guncel = await buildGuncel();
    render();
  }

  function onYil() { syncChips(); render(); }

  // Guncel (2026) degerler: data.guncel; gram altin canli rates.json ile override. (geriye uyumlu)
  async function buildGuncel() {
    const son = data.guncel || data.yillar["2025"];
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

  // ── Year / amount chips ──────────────────────────────────────────────────
  function initChips() {
    $("year-chips").addEventListener("click", (e) => {
      const b = e.target.closest("[data-year]"); if (!b) return;
      $("yil-input").value = b.dataset.year; syncChips(); render();
    });
    $("amount-chips").addEventListener("click", (e) => {
      const b = e.target.closest("[data-amount]"); if (!b) return;
      $("tutar-input").value = b.dataset.amount; syncChips(); render();
    });
  }
  function syncChips() {
    const yil = String($("yil-input").value);
    document.querySelectorAll("#year-chips .pg-chip").forEach((c) => c.classList.toggle("active", c.dataset.year === yil));
    const tut = String(Math.round(parseFloat($("tutar-input").value) || 0));
    document.querySelectorAll("#amount-chips .pg-chip").forEach((c) => c.classList.toggle("active", c.dataset.amount === tut));
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  function render() {
    if (!data || !guncel) return;
    const yil = $("yil-input").value;
    $("yil-label").textContent = yil;
    syncChips();
    const tutar = Math.max(0, parseFloat($("tutar-input").value) || 0);
    const gec = PG.interpoleYil(data.yillar, yil) || data.yillar["2015"];

    // o gunku adetler vs bugunku adetler (ayni nominal tutar)
    const ceyrekGec = PG.birimAdedi(tutar, gec.gram_altin * CEYREK_GRAM);
    const ceyrekBug = PG.birimAdedi(tutar, guncel.gram_altin * CEYREK_GRAM);
    const usdGec = PG.birimAdedi(tutar, gec.usd), usdBug = PG.birimAdedi(tutar, guncel.usd);
    const ekmekGec = PG.birimAdedi(tutar, gec.ekmek), ekmekBug = PG.birimAdedi(tutar, guncel.ekmek);
    const asgGec = PG.birimAdedi(tutar, gec.asgari_ucret_net), asgBug = PG.birimAdedi(tutar, guncel.asgari_ucret_net);

    const altinBugun = PG.degerKoruma(tutar, gec.gram_altin, guncel.gram_altin);
    const dolarBugun = PG.degerKoruma(tutar, gec.usd, guncel.usd);
    const kayip = Math.max(0, altinBugun - tutar);
    const erodePct = altinBugun > 0 ? (1 - tutar / altinBugun) * 100 : 0;

    // Hero reveal (carpici kayip + koruma)
    $("reveal-label").innerHTML = `<b>${fmtTL(tutar)}</b>'yi (${yil}) nakit tuttuysan bugüne dek kaybın`;
    if (NV) NV.countUp($("reveal-big"), kayip, { format: fmtTL }); else $("reveal-big").textContent = fmtTL(kayip);
    $("reveal-pct").textContent = `≈ %${fmt.format(erodePct)} alım gücü eridi`;
    setProt("prot-gold", "prot-gold-pct", altinBugun, PG.yuzdeDegisim(tutar, altinBugun));
    setProt("prot-usd", "prot-usd-pct", dolarBugun, PG.yuzdeDegisim(tutar, dolarBugun));

    // Sonuc kartlari
    $("results-title").innerHTML = `${fmtTL(tutar)} ile <span style="color:var(--accent)">o zaman → bugün</span> ne alırsın?`;
    const cards = [
      { icon: "🪙", label: "Çeyrek altın", then: ceyrekGec, now: ceyrekBug, unit: "adet" },
      { icon: "💵", label: "Dolar", then: usdGec, now: usdBug, unit: "$" },
      { icon: "🍞", label: "Ekmek", then: ekmekGec, now: ekmekBug, unit: "adet" },
      { icon: "👤", label: "Asgari ücret", then: asgGec, now: asgBug, unit: "maaş" }
    ];
    $("results-grid").innerHTML = cards.map(rcard).join("");

    cizGrafik(tutar);
    guncelleKart(yil, tutar, ceyrekGec, ceyrekBug, ekmekGec, ekmekBug, usdGec, usdBug, altinBugun);
  }

  function setProt(valId, pctId, val, pct) {
    if (NV) NV.countUp($(valId), val, { format: fmtTL }); else $(valId).textContent = fmtTL(val);
    $(pctId).textContent = `${pct >= 0 ? "+" : ""}%${fmt.format(pct)}`;
  }

  function rcard(c) {
    const retained = c.then > 0 ? Math.max(0, Math.min(1, c.now / c.then)) : 0;
    const erode = (1 - retained) * 100;
    return `<div class="pg-rcard">
      <div class="pg-rcard-top"><span class="pg-rcard-icon">${c.icon}</span><span class="pg-rcard-label">${c.label}</span></div>
      <div class="pg-rcard-vals">
        <span class="pg-rcard-then">${fmt.format(c.then)} ${c.unit}</span>
        <span class="pg-rcard-arrow">→</span>
        <span class="pg-rcard-now">${fmt.format(c.now)}<span class="pg-rcard-unit">${c.unit}</span></span>
      </div>
      <div class="pg-rcard-bar"><span style="width:${(retained * 100).toFixed(1)}%"></span></div>
      <div class="pg-rcard-erode">−%${fmt.format(erode)} alım gücü</div>
    </div>`;
  }

  function cizGrafik(tutar) {
    const yillar = Object.keys(data.yillar).sort();
    const altinAdet = yillar.map((y) => PG.birimAdedi(tutar, data.yillar[y].gram_altin));
    if (typeof Chart === "undefined") return;
    const ctx = $("paragraf-chart").getContext("2d");
    const grad = ctx.createLinearGradient(0, 0, 0, 260);
    grad.addColorStop(0, "rgba(212,181,114,.28)"); grad.addColorStop(1, "rgba(212,181,114,0)");
    if (chart) chart.destroy();
    chart = new Chart(ctx, {
      type: "line",
      data: { labels: yillar, datasets: [{ label: `${fmtTL(tutar)} kaç gram altın eder?`, data: altinAdet, borderColor: "#d4b572", backgroundColor: grad, borderWidth: 2, fill: true, tension: .3, pointRadius: 0, pointHoverRadius: 5 }] },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { labels: { color: "#9aa0ab", font: { family: "Inter" } } }, tooltip: { callbacks: { label: (c) => `${fmt.format(c.parsed.y)} gram altın` } } },
        scales: { x: { ticks: { color: "#9aa0ab", font: { family: "JetBrains Mono", size: 10 } }, grid: { display: false } }, y: { ticks: { color: "#9aa0ab", font: { family: "JetBrains Mono", size: 10 } }, grid: { color: "rgba(212,181,114,.1)" } } }
      }
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

  // ── Share / download (her ortamda calisan onizleme modali) ─────────────────
  async function ensureHtml2Canvas() {
    if (typeof html2canvas !== "undefined") return;
    await new Promise((res, rej) => {
      const s = document.createElement("script");
      s.src = "https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js";
      s.onload = res; s.onerror = () => rej(new Error("html2canvas yüklenemedi (ağ/engel)."));
      document.head.appendChild(s);
    });
  }

  function initModal() {
    const overlay = $("pg-modal-overlay");
    const close = () => closeModal();
    $("pg-modal-close").addEventListener("click", close);
    overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && overlay.classList.contains("open")) close(); });
    $("pg-modal-open").addEventListener("click", () => { if (lastObjectUrl) window.open(lastObjectUrl, "_blank"); });
  }

  function closeModal() {
    $("pg-modal-overlay").classList.remove("open");
    if (lastObjectUrl) { setTimeout(() => { URL.revokeObjectURL(lastObjectUrl); lastObjectUrl = null; }, 500); }
  }

  function openShareModal(blob) {
    if (lastObjectUrl) URL.revokeObjectURL(lastObjectUrl);
    lastObjectUrl = URL.createObjectURL(blob);
    const file = new File([blob], "paragraf.png", { type: "image/png" });

    $("pg-modal-img").src = lastObjectUrl;
    const dl = $("pg-modal-download"); dl.href = lastObjectUrl; dl.download = "paragraf.png";

    // Web Share yalniz gercekten destekleniyorsa
    const shareBtn = $("pg-modal-share");
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      shareBtn.style.display = "";
      shareBtn.onclick = async () => {
        try { await navigator.share({ files: [file], title: "ParaGraf", text: "Paran eridi mi? kuraura.com.tr/paragraf" }); }
        catch (e) { if (!(e && e.name === "AbortError")) { if (NV) NV.toast("Paylaşım iptal edildi.", "info"); } }
      };
    } else {
      shareBtn.style.display = "none";
    }

    // In-app tarayici (Instagram/FB/...) -> indir/share kisitli; uzun-bas yonergesini one cikar
    const inApp = /Instagram|FBAN|FBAV|FB_IAB|Line|Twitter|Snapchat|Pinterest/i.test(navigator.userAgent || "");
    const hint = $("pg-modal-hint");
    hint.classList.toggle("inapp", inApp);
    hint.innerHTML = inApp
      ? 'Uygulama içi tarayıcıdasın — kaydetmek için <b>görsele uzun bas → "Görseli kaydet"</b>, ya da sağ üstten Safari/Chrome\'da aç.'
      : 'İndir butonu çalışmazsa görsele <b>uzun bas</b> → "Görseli kaydet".';

    $("pg-modal-overlay").classList.add("open");
    if (NV && NV.focusTrap) NV.focusTrap($("pg-modal"));
  }

  async function paylas() {
    if (!data || !guncel) { if (NV) NV.toast("Önce veriler yüklensin.", "info"); return; }
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
        onclone: (doc) => { const c = doc.getElementById("share-card"); if (c) { c.style.left = "0"; c.style.top = "0"; } },
      });
      const blob = await new Promise((res) => canvas.toBlob(res, "image/png"));
      if (!blob) throw new Error("Görsel oluşturulamadı (toBlob boş döndü).");
      openShareModal(blob);
    } catch (e) {
      console.error("paylasim hatasi", e);
      if (NV) NV.toast("Kart oluşturulamadı: " + (e && e.message ? e.message : e), "down");
      else alert("Kart oluşturulamadı: " + (e && e.message ? e.message : e));
    } finally {
      btn.disabled = false; btn.innerHTML = eski;
    }
  }

  init();
})();
