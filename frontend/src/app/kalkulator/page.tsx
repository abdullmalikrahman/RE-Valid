'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import { useStations } from '@/hooks/useStations';

export default function KalkulatorPage() {
  // --- Energy type toggle ---
  const { stations } = useStations();
  const [energyType, setEnergyType] = useState<'wind' | 'solar'>('wind');
  const isWind = energyType === 'wind';
  const [exportingPDF, setExportingPDF] = useState(false);

  // --- Station selector ---
  const [selectedStationId, setSelectedStationId] = useState<string>('none');

  // --- Technical parameters ---
  const [kapasitas, setKapasitas] = useState(50);         // MW / MWp
  const [faktorKapasitas, setFaktorKapasitas] = useState(18); // % (wind CF)
  const [performanceRatio, setPerformanceRatio] = useState(75); // % (solar PR)
  const [umurProyek, setUmurProyek] = useState(20);       // years
  const [degradasi, setDegradasi] = useState(0.5);        // % per year

  // --- Financial parameters ---
  const [capex, setCapex] = useState(45.5);               // M USD
  const [opex, setOpex] = useState(1.5);                  // % of CAPEX
  const [diskonto, setDiskonto] = useState(8.5);          // %
  const [tarif, setTarif] = useState(80);                 // USD/MWh

  // --- Pre-fill from station ---
  function loadFromStation(id: string) {
    const s = stations.find((st) => st.id === id);
    if (!s) return;
    setSelectedStationId(id);
    if (isWind) {
      // Prioritas: GWA 3.0 → NASA POWER → baseline → terukur
      const speed = s.windBaselineGwa ?? s.windBaselineNasa ?? s.windBaseline ?? s.windSpeed;
      const cf = Math.round(Math.max(15, Math.min(42, speed * 3.8)));
      setFaktorKapasitas(cf);
    } else {
      // Solar: PR default 75%, CAPEX disesuaikan kapasitas
      setPerformanceRatio(75);
      // CAPEX PLTS lebih rendah (~$0.8–1.2 M/MWp) vs angin (~$1.0–1.5 M/MW)
      setCapex(parseFloat((kapasitas * 0.9).toFixed(1)));
    }
  }

  // --- AEP Year 1 ---
  const aepY1 = useMemo(() => {
    if (isWind) {
      return (kapasitas * (faktorKapasitas / 100) * 8760) / 1000; // GWh
    } else {
      // AEP PLTS = kapasitas (MWp) × GHI (kWh/m²/day) × 365 × PR
      // Prioritas sumber GHI: GSA (Solargis) → NASA POWER → baseline → irradiation terukur
      const station = stations.find((s) => s.id === selectedStationId);
      const ghi = station
        ? (station.ghiBaselineGsa ?? station.ghiBaselineNasa ?? station.ghiBaseline ?? station.irradiation ?? 4.5)
        : 4.5;
      return (kapasitas * ghi * 365 * (performanceRatio / 100)) / 1000; // GWh
    }
  }, [kapasitas, faktorKapasitas, performanceRatio, energyType, selectedStationId, isWind, stations]);

  // --- Computed cash flows ---
  const cashFlows = useMemo(() => {
    return Array.from({ length: umurProyek }, (_, i) => {
      const yr = i + 1;
      const aepYr = aepY1 * Math.pow(1 - degradasi / 100, yr - 1);
      const revenueYr = (aepYr * 1000 * tarif) / 1_000_000; // M USD
      const opexYr = (capex * opex) / 100; // M USD
      const net = revenueYr - opexYr;
      return {
        year: yr,
        energy: parseFloat(aepYr.toFixed(2)),
        revenue: parseFloat(revenueYr.toFixed(2)),
        opex: parseFloat(opexYr.toFixed(2)),
        net: parseFloat(net.toFixed(2)),
      };
    });
  }, [aepY1, umurProyek, degradasi, capex, opex, tarif]);

  // --- KPIs ---
  const kpis = useMemo(() => {
    const r = diskonto / 100;

    const npv = cashFlows.reduce((acc, cf) => acc + cf.net / Math.pow(1 + r, cf.year), 0) - capex;

    const discOpex = cashFlows.reduce((acc, cf) => acc + cf.opex / Math.pow(1 + r, cf.year), 0);
    const discAep = cashFlows.reduce((acc, cf) => acc + cf.energy / Math.pow(1 + r, cf.year), 0);
    const lcoeCents = discAep > 0 ? ((capex + discOpex) * 100) / discAep : 0;

    let cumulative = -capex;
    let payback = umurProyek;
    for (const cf of cashFlows) {
      const prev = cumulative;
      cumulative += cf.net;
      if (cumulative >= 0) {
        payback = cf.year - 1 + (-prev / cf.net);
        break;
      }
    }

    const totalNet = cashFlows.reduce((acc, cf) => acc + cf.net, 0);
    const roi = capex > 0 ? (totalNet / capex) * 100 : 0;

    // ── IRR via Newton-Raphson ────────────────────────────────────
    const flows = [-capex, ...cashFlows.map((cf) => cf.net)];
    let irr = 0.1;
    for (let i = 0; i < 200; i++) {
      let f = 0;
      let df = 0;
      flows.forEach((c, t) => {
        const denom = Math.pow(1 + irr, t);
        f += c / denom;
        if (t > 0) df -= (t * c) / (denom * (1 + irr));
      });
      if (Math.abs(df) < 1e-12) break;
      const irr1 = irr - f / df;
      if (Math.abs(irr1 - irr) < 1e-8) { irr = irr1; break; }
      irr = irr1 <= -1 ? 0.01 : irr1;
    }
    const irrPct = isFinite(irr) ? irr * 100 : null;

    return {
      aepY1,
      npv: parseFloat(npv.toFixed(1)),
      lcoeCents: parseFloat(lcoeCents.toFixed(2)),
      payback: parseFloat(payback.toFixed(1)),
      roi: parseFloat(roi.toFixed(1)),
      irr: irrPct !== null ? parseFloat(irrPct.toFixed(1)) : null,
    };
  }, [cashFlows, capex, diskonto, umurProyek, aepY1]);

  const barData = cashFlows.filter((_, i) => i % 2 === 0).slice(0, 6).map((cf) => ({
    label: `Y${cf.year}`,
    rev: Math.min(100, Math.round((cf.revenue / (cashFlows[0]?.revenue ?? 1)) * 80)),
    cost: Math.min(100, Math.round((cf.opex / (cashFlows[0]?.revenue ?? 1)) * 80)),
  }));

  const isViable = kpis.npv > 0;
  const selectedStation = stations.find((s) => s.id === selectedStationId);
  const accentClass = isWind ? 'text-primary' : 'text-amber-400';
  const accentBg = isWind ? 'bg-primary' : 'bg-amber-500';

  function handleReset() {
    setKapasitas(50);
    setFaktorKapasitas(isWind ? 18 : 20);
    setPerformanceRatio(75);
    setUmurProyek(20);
    setDegradasi(0.5);
    setCapex(isWind ? 45.5 : 45.0);
    setOpex(1.5);
    setDiskonto(8.5);
    setTarif(80);
    setSelectedStationId('none');
  }

  function handleEnergyToggle(type: 'wind' | 'solar') {
    setEnergyType(type);
    setSelectedStationId('none');
    if (type === 'wind') {
      setFaktorKapasitas(18);
      setCapex(45.5);
      setDegradasi(0.5);
    } else {
      setFaktorKapasitas(20);
      setCapex(45.0);
      setDegradasi(0.4); // PLTS degradasi panel ~0.4%/thn
    }
  }

  async function handleExportPDF() {
    setExportingPDF(true);
    try {
      const { default: jsPDF } = await import('jspdf');
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const W = pdf.internal.pageSize.getWidth();
      let y = 18;

      // Header
      pdf.setFillColor(19, 127, 236);
      pdf.rect(0, 0, W, 14, 'F');
      pdf.setTextColor(255, 255, 255);
      pdf.setFontSize(11);
      pdf.setFont('helvetica', 'bold');
      pdf.text('RE-Valid — Kalkulator Energi & Ekonomi', 10, 9.5);
      pdf.setFontSize(8);
      pdf.setFont('helvetica', 'normal');
      pdf.text(`Diekspor: ${new Date().toLocaleString('id-ID')}`, W - 10, 9.5, { align: 'right' });

      // Title
      pdf.setTextColor(30, 30, 30);
      pdf.setFontSize(14);
      pdf.setFont('helvetica', 'bold');
      pdf.text(`Simulasi ${isWind ? 'PLTB (Angin)' : 'PLTS (Surya)'}`, 10, y);
      y += 7;

      // Parameter summary
      pdf.setFontSize(9);
      pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(80, 80, 80);
      const paramLines = [
        `Kapasitas: ${kapasitas} ${isWind ? 'MW' : 'MWp'}  |  ${isWind ? `CF: ${faktorKapasitas}%` : `PR: ${performanceRatio}%`}  |  Umur Proyek: ${umurProyek} thn  |  Degradasi: ${degradasi}%/thn`,
        `CAPEX: $${capex} Jt  |  OPEX: ${opex}% CAPEX/thn  |  Diskonto: ${diskonto}%  |  Tarif: $${tarif}/MWh`,
        selectedStation ? `Stasiun Referensi: ${selectedStation.name} (${selectedStation.id})` : 'Stasiun: Manual (tidak ada stasiun dipilih)',
      ];
      paramLines.forEach((line) => { pdf.text(line, 10, y); y += 5; });
      y += 3;

      // KPI section
      pdf.setDrawColor(200, 200, 200);
      pdf.setFillColor(245, 247, 250);
      pdf.rect(10, y, W - 20, 28, 'FD');
      pdf.setFontSize(8);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(100, 100, 100);
      const kpiLabels = ['AEP Thn-1 (GWh)', 'LCOE (¢/kWh)', 'NPV (Jt USD)', 'Payback (Thn)', 'IRR (%)'];
      const kpiVals = [
        kpis.aepY1.toFixed(2),
        kpis.lcoeCents.toFixed(2),
        `${kpis.npv >= 0 ? '+' : ''}${kpis.npv.toFixed(1)}`,
        kpis.payback.toFixed(1),
        kpis.irr !== null ? `${kpis.irr.toFixed(1)}%` : 'N/A',
      ];
      const colW = (W - 20) / 5;
      kpiLabels.forEach((lbl, i) => {
        const x = 10 + i * colW + colW / 2;
        pdf.setFont('helvetica', 'normal');
        pdf.setTextColor(100, 100, 100);
        pdf.text(lbl, x, y + 8, { align: 'center' });
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(12);
        pdf.setTextColor(i === 2 ? (kpis.npv >= 0 ? 34 : 220) : 19, i === 2 ? (kpis.npv >= 0 ? 197 : 38 ) : 127, i === 2 ? (kpis.npv >= 0 ? 94 : 60) : 236);
        pdf.text(kpiVals[i], x, y + 18, { align: 'center' });
        pdf.setFontSize(8);
      });
      y += 34;

      // Viability badge
      pdf.setFillColor(kpis.npv >= 0 ? 220 : 254, kpis.npv >= 0 ? 252 : 226, kpis.npv >= 0 ? 231 : 226);
      pdf.roundedRect(10, y, W - 20, 8, 2, 2, 'F');
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(9);
      pdf.setTextColor(kpis.npv >= 0 ? 22 : 185, kpis.npv >= 0 ? 163 : 28, kpis.npv >= 0 ? 74 : 28);
      pdf.text(kpis.npv >= 0 ? 'NPV Positif — Proyek Layak Secara Finansial' : 'NPV Negatif — Proyek Tidak Layak', W / 2, y + 5.5, { align: 'center' });
      y += 14;

      // ── Arus Kas Kumulatif chart ──────────────────────────────────────────
      pdf.setFontSize(10);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(30, 30, 30);
      pdf.text('Arus Kas Kumulatif', 10, y);
      y += 5;
      pdf.setFontSize(8);
      pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(100, 100, 100);
      pdf.text('Akumulasi arus kas bersih terhadap tahun proyek (titik = titik balik modal)', 10, y);
      y += 6;
      {
        const cX = 20;
        const cW = W - 30;
        const cH = 52;
        const cumVals: number[] = [-capex];
        let cumRun = -capex;
        for (const cf of cashFlows) { cumRun += cf.net; cumVals.push(cumRun); }
        const minV = Math.min(...cumVals);
        const maxV = Math.max(...cumVals);
        const rangeV = maxV - minV || 1;
        const cToY = (v: number) => y + cH - ((v - minV) / rangeV) * cH;
        const cToX = (i: number) => cX + (i / umurProyek) * cW;

        pdf.setFillColor(248, 250, 252);
        pdf.setDrawColor(210, 215, 220);
        pdf.setLineWidth(0.2);
        pdf.rect(cX, y, cW, cH, 'FD');

        pdf.setDrawColor(225, 230, 235);
        for (let gi = 1; gi <= 4; gi++) {
          pdf.line(cX, y + (gi / 5) * cH, cX + cW, y + (gi / 5) * cH);
        }

        if (minV < 0 && maxV > 0) {
          const zeroY = cToY(0);
          pdf.setDrawColor(170, 170, 170);
          pdf.setLineWidth(0.4);
          pdf.line(cX, zeroY, cX + cW, zeroY);
          pdf.setFontSize(6);
          pdf.setTextColor(120, 120, 120);
          pdf.text('0', cX - 1, zeroY + 1.5, { align: 'right' });
        }

        pdf.setLineWidth(0.8);
        for (let i = 1; i < cumVals.length; i++) {
          const bothPos = cumVals[i] >= 0 && cumVals[i - 1] >= 0;
          const bothNeg = cumVals[i] < 0 && cumVals[i - 1] < 0;
          if (bothPos) pdf.setDrawColor(34, 197, 94);
          else if (bothNeg) pdf.setDrawColor(220, 38, 38);
          else pdf.setDrawColor(19, 127, 236);
          pdf.line(cToX(i - 1), cToY(cumVals[i - 1]), cToX(i), cToY(cumVals[i]));
        }

        if (kpis.payback < umurProyek) {
          const pbX = cToX(kpis.payback);
          const pbY = cToY(0);
          pdf.setFillColor(19, 127, 236);
          pdf.setDrawColor(255, 255, 255);
          pdf.setLineWidth(0.3);
          pdf.circle(pbX, pbY, 1.5, 'FD');
          pdf.setFontSize(6.5);
          pdf.setFont('helvetica', 'bold');
          pdf.setTextColor(19, 127, 236);
          pdf.text(`Payback Y${kpis.payback.toFixed(1)}`, pbX + 2.5, pbY - 2);
        }

        pdf.setFontSize(6.5);
        pdf.setFont('helvetica', 'normal');
        pdf.setTextColor(100, 100, 100);
        [0, 0.25, 0.5, 0.75, 1].forEach((t) => {
          const yr = Math.round(t * umurProyek);
          pdf.text(`Y${yr}`, cToX(yr), y + cH + 4, { align: 'center' });
        });

        pdf.setFontSize(6);
        pdf.text(`${maxV.toFixed(0)}`, cX - 1, y + 2, { align: 'right' });
        pdf.text(`${minV.toFixed(0)}`, cX - 1, y + cH, { align: 'right' });

        const legY = y + 5;
        pdf.setFontSize(7);
        pdf.setDrawColor(34, 197, 94); pdf.setLineWidth(0.8);
        pdf.line(cX + cW - 55, legY, cX + cW - 47, legY);
        pdf.setTextColor(50, 50, 50);
        pdf.text('Arus positif', cX + cW - 46, legY + 1.5);
        pdf.setDrawColor(220, 38, 38);
        pdf.line(cX + cW - 28, legY, cX + cW - 20, legY);
        pdf.text('Arus negatif', cX + cW - 19, legY + 1.5);
        y += cH + 12;
      }

      // ── Page 2: Rincian Arus Kas ──────────────────────────────────────────
      pdf.addPage();
      y = 18;
      pdf.setFillColor(19, 127, 236);
      pdf.rect(0, 0, W, 14, 'F');
      pdf.setTextColor(255, 255, 255);
      pdf.setFontSize(11);
      pdf.setFont('helvetica', 'bold');
      pdf.text('RE-Valid — Kalkulator Energi & Ekonomi', 10, 9.5);
      pdf.setFontSize(8);
      pdf.setFont('helvetica', 'normal');
      pdf.text(`Simulasi ${isWind ? 'PLTB' : 'PLTS'} — Rincian Arus Kas`, W - 10, 9.5, { align: 'right' });

      // Cash flow table
      pdf.setFontSize(10);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(30, 30, 30);
      pdf.text('Rincian Arus Kas', 10, y);
      y += 5;

      const headers = ['Tahun', `AEP (GWh)`, 'Pendapatan ($Jt)', 'OPEX ($Jt)', 'Arus Kas Bersih ($Jt)'];
      const cols = [15, 30, 45, 35, 50];
      let x = 10;
      pdf.setFillColor(235, 240, 248);
      pdf.rect(10, y, W - 20, 7, 'F');
      pdf.setFontSize(8);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(60, 60, 60);
      headers.forEach((h, i) => { pdf.text(h, x + 2, y + 5); x += cols[i]; });
      y += 7;

      cashFlows.forEach((row) => {
        x = 10;
        pdf.setFont('helvetica', 'normal');
        pdf.setTextColor(40, 40, 40);
        if (cashFlows.indexOf(row) % 2 === 0) { pdf.setFillColor(250, 250, 252); pdf.rect(10, y, W - 20, 6.5, 'F'); }
        const cells = [String(row.year), String(row.energy), row.revenue.toFixed(2), row.opex.toFixed(2), (row.net >= 0 ? '+' : '') + row.net.toFixed(2)];
        cells.forEach((c, i) => {
          if (i === 4) pdf.setTextColor(row.net >= 0 ? 22 : 185, row.net >= 0 ? 163 : 28, row.net >= 0 ? 74 : 28);
          else pdf.setTextColor(40, 40, 40);
          pdf.text(c, x + 2, y + 4.5); x += cols[i];
        });
        y += 6.5;
      });
      y += 6;

      // Footer disclaimer
      pdf.setFontSize(7);
      pdf.setFont('helvetica', 'italic');
      pdf.setTextColor(150, 150, 150);
      pdf.text('Simulasi screening awal. Tidak menggantikan studi kelayakan finansial atau analisis detail konsultan EBT bersertifikat.', 10, y);
      pdf.text('Sumber: RE-Valid DSS — ERA5/GWA/GSA', 10, y + 4);

      pdf.save(`RE-Valid_Kalkulator_${new Date().toISOString().slice(0, 10)}.pdf`);
    } finally {
      setExportingPDF(false);
    }
  }

  const cumPoints = useMemo(() => {
    let cum = -capex;
    const vals = [cum];
    for (const cf of cashFlows) {
      cum += cf.net;
      vals.push(cum);
    }
    const minVal = Math.min(...vals);
    const maxVal = Math.max(...vals);
    const range = maxVal - minVal || 1;
    const norm = (v: number) => 5 + (1 - (v - minVal) / range) * 90;
    const zeroY = Math.max(5, Math.min(95, norm(0)));
    const pts = vals.map((v, i) => `${(i / umurProyek) * 100},${norm(v)}`);
    return {
      pathD: `M${pts.join(' L')}`,
      areaD: `M${pts.join(' L')} L100,95 L0,95 Z`,
      zeroY,
    };
  }, [cashFlows, capex, umurProyek]);

  return (
    <div className="bg-background-light dark:bg-background-dark font-display text-slate-900 dark:text-white min-h-screen flex flex-col text-sm">
      <Navbar />

      <main className="flex-1 flex flex-col w-full max-w-360 mx-auto px-4 lg:px-8 py-4">
        {/* Page header */}
        <div className="flex flex-col gap-3 mb-4 pt-1">
          <div className="flex flex-wrap justify-between items-start gap-3">
            <div className="flex flex-col gap-1">
              <h1 className="text-xl font-bold leading-tight text-slate-900 dark:text-white">
                Kalkulator Energi &amp; Ekonomi
              </h1>
              <p className="text-slate-600 dark:text-text-secondary text-sm font-normal leading-relaxed">
                {isWind
                  ? 'Simulasi estimasi AEP PLTB dan kelayakan ekonomi (LCOE, NPV, ROI) berdasarkan data angin tervalidasi.'
                  : 'Simulasi estimasi AEP PLTS dan kelayakan ekonomi (LCOE, NPV, ROI) berdasarkan data iradiasi surya tervalidasi.'}
              </p>
            </div>
            <div className="flex gap-3 shrink-0">
              <button
                onClick={handleExportPDF}
                disabled={exportingPDF}
                className="flex items-center gap-2 px-4 py-2 bg-slate-200 dark:bg-card-dark text-slate-700 dark:text-white rounded-lg hover:bg-slate-300 dark:hover:bg-border-dark transition-all text-sm font-medium disabled:opacity-60 disabled:cursor-wait"
              >
                {exportingPDF
                  ? <><span className="material-symbols-outlined text-[18px] animate-spin">refresh</span>Memproses...</>
                  : <><span className="material-symbols-outlined text-[18px]">download</span>Ekspor PDF</>
                }
              </button>
            </div>
          </div>
          {/* Warning full-width */}
          <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg px-4 py-2.5">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-yellow-500 text-[16px] shrink-0">warning</span>
              <p className="text-xs text-yellow-700 dark:text-yellow-500/80">
                <span className="font-bold text-yellow-600 dark:text-yellow-400">Simulasi Screening Awal — </span>
                Tidak menggantikan studi kelayakan finansial atau analisis detail konsultan EBT bersertifikat.
              </p>
            </div>
          </div>
        </div>

        {/* Energy type toggle */}
        <div className="flex items-center gap-3 mb-5">
          <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide shrink-0">Jenis Proyek:</p>
          <div className="flex bg-gray-100 dark:bg-[#111a22] rounded-lg p-1 gap-1 border border-gray-200 dark:border-border-dark">
            <button
              onClick={() => handleEnergyToggle('wind')}
              className={`flex items-center gap-1.5 px-4 py-1.5 rounded-md text-xs font-semibold transition-all ${
                isWind
                  ? 'bg-primary text-white shadow-sm shadow-blue-500/30'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white'
              }`}
            >
              <span className="material-symbols-outlined text-[15px]">air</span>
              PLTB (Angin)
            </button>
            <button
              onClick={() => handleEnergyToggle('solar')}
              className={`flex items-center gap-1.5 px-4 py-1.5 rounded-md text-xs font-semibold transition-all ${
                !isWind
                  ? 'bg-amber-500 text-white shadow-sm shadow-amber-500/30'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white'
              }`}
            >
              <span className="material-symbols-outlined text-[15px]">wb_sunny</span>
              PLTS (Surya)
            </button>
          </div>
          <p className="text-[11px] text-slate-400">
            {isWind ? 'CF pre-fill dari baseline atlas (GWA 3.0 / NASA POWER ERA5) · CAPEX ref. ~$1.0–1.5 M/MW' : 'AEP dihitung dari GHI baseline (GSA / NASA POWER ERA5) · CAPEX ref. ~$0.8–1.2 M/MWp'}
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 flex-1 items-start">
          {/* ─── Input sidebar ─────────────────────────────────────────────── */}
          <aside className="lg:col-span-4 xl:col-span-4 flex flex-col gap-4 lg:sticky lg:top-4">

            {/* Station pre-fill */}
            <div className="bg-white dark:bg-card-dark rounded-lg border border-gray-200 dark:border-border-dark p-4 flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <span className={`material-symbols-outlined ${accentClass} text-[18px]`}>location_on</span>
                <p className="text-sm font-semibold text-slate-900 dark:text-white">Pre-isi dari Stasiun</p>
              </div>
              <div className="relative">
                <select
                  value={selectedStationId}
                  onChange={(e) => loadFromStation(e.target.value)}
                  className="w-full bg-gray-50 dark:bg-[#111a22] border border-gray-200 dark:border-border-dark rounded-lg px-3 py-2 text-xs font-medium text-slate-900 dark:text-white focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary appearance-none pr-8"
                >
                  <option value="none">— Pilih Stasiun —</option>
                  {stations.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.id}) &mdash; {isWind
                        ? `${s.windBaselineGwa ?? s.windBaselineNasa ?? s.windBaseline ?? s.windSpeed} m/s`
                        : `${s.ghiBaselineGsa ?? s.ghiBaselineNasa ?? s.ghiBaseline ?? s.irradiation} kWh/m²/hari`}
                    </option>
                  ))}
                </select>
                <span className="material-symbols-outlined absolute right-2 top-2 text-slate-400 pointer-events-none text-[18px]">expand_more</span>
              </div>

              {selectedStationId !== 'none' && selectedStation && (
                <>
                  <div className={`flex items-center gap-2 text-[11px] ${isWind ? 'text-green-500 bg-green-500/10 border-green-500/20' : 'text-amber-500 bg-amber-500/10 border-amber-500/20'} border rounded px-2.5 py-1.5`}>
                    <span className="material-symbols-outlined text-[14px]">check_circle</span>
                    {isWind
                      ? `CF dihitung dari baseline angin: ${selectedStation.windBaselineGwa ?? selectedStation.windBaselineNasa ?? selectedStation.windBaseline ?? selectedStation.windSpeed} m/s`
                      : `GHI aktif: ${selectedStation.ghiBaselineGsa ?? selectedStation.ghiBaselineNasa ?? selectedStation.ghiBaseline ?? selectedStation.irradiation} kWh/m²/hari (GSA/NASA POWER)`}
                  </div>
                  <div className="grid grid-cols-2 gap-1.5 text-[11px]">
                    <div className="bg-gray-50 dark:bg-[#111a22] rounded px-2.5 py-2 flex flex-col gap-0.5">
                      <span className="text-slate-400 uppercase font-bold text-[10px]">{isWind ? 'Baseline Angin' : 'GHI Baseline'}</span>
                      <span className="font-bold text-slate-900 dark:text-white">
                        {isWind
                          ? `${selectedStation.windBaselineGwa ?? selectedStation.windBaselineNasa ?? selectedStation.windBaseline ?? selectedStation.windSpeed} m/s`
                          : `${selectedStation.ghiBaselineGsa ?? selectedStation.ghiBaselineNasa ?? selectedStation.ghiBaseline ?? selectedStation.irradiation} kWh/m²/d`}
                      </span>
                      <span className="text-slate-400 text-[10px]">
                        {isWind
                          ? (selectedStation.windBaselineGwa != null ? 'GWA 3.0' : selectedStation.windBaselineNasa != null ? 'NASA POWER' : 'Terukur')
                          : (selectedStation.ghiBaselineGsa != null ? 'GSA (Solargis)' : selectedStation.ghiBaselineNasa != null ? 'NASA POWER' : 'Terukur')}
                      </span>
                    </div>
                    <div className="bg-gray-50 dark:bg-[#111a22] rounded px-2.5 py-2 flex flex-col gap-0.5">
                      <span className="text-slate-400 uppercase font-bold text-[10px]">Skor GIS</span>
                      <span className="font-bold text-slate-900 dark:text-white">{selectedStation.score}/100</span>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Link
                      href={`/analisis?station=${selectedStationId}`}
                      className="flex-1 flex items-center justify-center gap-1 py-1.5 text-[11px] font-medium text-primary border border-primary/30 rounded-lg hover:bg-primary/5 transition-all"
                    >
                      <span className="material-symbols-outlined text-[13px]">bar_chart</span>
                      Lihat Analisis
                    </Link>
                    <Link
                      href={`/laporan?station=${selectedStationId}&from=kalkulator`}
                      className="flex-1 flex items-center justify-center gap-1 py-1.5 text-[11px] font-medium text-slate-600 dark:text-slate-300 border border-slate-300 dark:border-[#233648] rounded-lg hover:bg-slate-50 dark:hover:bg-[#233648] transition-all"
                    >
                      <span className="material-symbols-outlined text-[13px]">description</span>
                      Lihat Laporan
                    </Link>
                  </div>
                </>
              )}
            </div>

            <div className="flex flex-col gap-3">
              <div className="flex justify-between items-center">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">Parameter Masukan</h3>
                <button onClick={handleReset} className={`text-xs font-medium ${accentClass} hover:opacity-70`}>Reset Default</button>
              </div>

              {/* Technical parameters */}
              <details className="group flex flex-col rounded-lg border border-gray-200 dark:border-border-dark bg-white dark:bg-card-dark overflow-hidden" open>
                <summary className="flex cursor-pointer items-center justify-between gap-4 px-4 py-3 bg-gray-50 dark:bg-[#23303d] hover:bg-gray-100 dark:hover:bg-[#2a3a4a] transition-colors">
                  <div className="flex items-center gap-2">
                    <span className={`material-symbols-outlined ${accentClass} text-[20px]`}>{isWind ? 'air' : 'solar_power'}</span>
                    <p className="text-slate-900 dark:text-white text-sm font-semibold">
                      Parameter Teknis {isWind ? 'PLTB' : 'PLTS'}
                    </p>
                  </div>
                  <span className="material-symbols-outlined text-slate-500 dark:text-white text-[18px] transition-transform group-open:rotate-180">expand_more</span>
                </summary>
                <div className="p-4 flex flex-col gap-5 border-t border-gray-200 dark:border-border-dark">

                  {/* Kapasitas */}
                  <div className="flex flex-col gap-1.5">
                    <div className="flex justify-between items-center">
                      <label className="text-xs font-medium text-slate-500 dark:text-text-secondary uppercase tracking-wide">
                        {isWind ? 'Kapasitas Terpasang' : 'Kapasitas Panel (MWp)'}
                      </label>
                      <span className={`text-[10px] font-bold ${accentClass} bg-primary/10 px-1.5 py-0.5 rounded`}>{isWind ? 'MW' : 'MWp'}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <input className="flex-1" max="200" min="1" type="range" value={kapasitas} onChange={(e) => setKapasitas(Number(e.target.value))} />
                      <input className="w-16 bg-gray-50 dark:bg-[#111a22] border border-gray-200 dark:border-border-dark rounded px-2 py-1.5 text-right text-sm font-medium text-slate-900 dark:text-white focus:outline-none focus:border-primary" type="number" min="1" max="200" value={kapasitas} onChange={(e) => setKapasitas(Number(e.target.value))} />
                    </div>
                  </div>

                  {/* CF / PR */}
                  {isWind ? (
                    <div className="flex flex-col gap-1.5">
                      <div className="flex justify-between items-center">
                        <label className="text-xs font-medium text-slate-500 dark:text-text-secondary uppercase tracking-wide">Faktor Kapasitas (CF)</label>
                        <span className="text-[10px] font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded">%</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <input className="flex-1" max="60" min="5" type="range" value={faktorKapasitas} onChange={(e) => setFaktorKapasitas(Number(e.target.value))} />
                        <input className="w-16 bg-gray-50 dark:bg-[#111a22] border border-gray-200 dark:border-border-dark rounded px-2 py-1.5 text-right text-sm font-medium text-slate-900 dark:text-white focus:outline-none focus:border-primary" type="number" min="5" max="60" value={faktorKapasitas} onChange={(e) => setFaktorKapasitas(Number(e.target.value))} />
                      </div>
                      <p className="text-[10px] text-slate-400">Tipikal PLTB Indonesia: 20–35% · CF = AEP / (Kapasitas × 8760)</p>
                    </div>
                  ) : (
                    <>
                      <div className="flex flex-col gap-1.5">
                        <div className="flex justify-between items-center">
                          <label className="text-xs font-medium text-slate-500 dark:text-text-secondary uppercase tracking-wide">Performance Ratio (PR)</label>
                          <span className="text-[10px] font-bold text-amber-500 bg-amber-500/10 px-1.5 py-0.5 rounded">%</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <input className="flex-1" max="90" min="50" type="range" value={performanceRatio} onChange={(e) => setPerformanceRatio(Number(e.target.value))} />
                          <input className="w-16 bg-gray-50 dark:bg-[#111a22] border border-gray-200 dark:border-border-dark rounded px-2 py-1.5 text-right text-sm font-medium text-slate-900 dark:text-white focus:outline-none" type="number" min="50" max="90" value={performanceRatio} onChange={(e) => setPerformanceRatio(Number(e.target.value))} />
                        </div>
                        <p className="text-[10px] text-slate-400">Tipikal PLTS tropik: 72–80% · Mencakup rugi kabel, suhu, debu</p>
                      </div>
                      <div className="bg-amber-500/5 border border-amber-500/20 rounded-lg p-3 text-[11px]">
                        <p className="font-semibold text-amber-600 dark:text-amber-400 mb-1">Rumus AEP PLTS</p>
                        <p className="text-slate-600 dark:text-slate-300 font-mono">AEP = MWp × GHI × 365 × PR</p>
                        {selectedStation ? (
                          <p className="text-amber-500 mt-1">
                            GHI = {selectedStation.ghiBaselineGsa ?? selectedStation.ghiBaselineNasa ?? selectedStation.ghiBaseline ?? selectedStation.irradiation} kWh/m²/hari
                            {' '}({selectedStation.ghiBaselineGsa != null ? 'GSA Solargis' : selectedStation.ghiBaselineNasa != null ? 'NASA POWER' : selectedStation.ghiBaseline != null ? 'Baseline Atlas' : 'Terukur'})
                          </p>
                        ) : (
                          <p className="text-slate-400 mt-1">Pilih stasiun untuk GHI aktual (prioritas: GSA → NASA POWER → Terukur)</p>
                        )}
                      </div>
                    </>
                  )}

                  {/* Umur Proyek */}
                  <div className="flex flex-col gap-1.5">
                    <div className="flex justify-between items-center">
                      <label className="text-xs font-medium text-slate-500 dark:text-text-secondary uppercase tracking-wide">Umur Proyek</label>
                      <span className={`text-[10px] font-bold ${accentClass} bg-primary/10 px-1.5 py-0.5 rounded`}>Tahun</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <input className="flex-1" max="30" min="5" type="range" value={umurProyek} onChange={(e) => setUmurProyek(Number(e.target.value))} />
                      <input className="w-16 bg-gray-50 dark:bg-[#111a22] border border-gray-200 dark:border-border-dark rounded px-2 py-1.5 text-right text-sm font-medium text-slate-900 dark:text-white focus:outline-none focus:border-primary" type="number" min="5" max="30" value={umurProyek} onChange={(e) => setUmurProyek(Number(e.target.value))} />
                    </div>
                  </div>

                  {/* Degradasi */}
                  <div className="flex flex-col gap-1.5">
                    <div className="flex justify-between items-center">
                      <label className="text-xs font-medium text-slate-500 dark:text-text-secondary uppercase tracking-wide">Degradasi Tahunan</label>
                      <span className={`text-[10px] font-bold ${accentClass} bg-primary/10 px-1.5 py-0.5 rounded`}>%</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <input className="flex-1" max="5" min="0" step="0.1" type="range" value={degradasi} onChange={(e) => setDegradasi(Number(e.target.value))} />
                      <input className="w-16 bg-gray-50 dark:bg-[#111a22] border border-gray-200 dark:border-border-dark rounded px-2 py-1.5 text-right text-sm font-medium text-slate-900 dark:text-white focus:outline-none focus:border-primary" step="0.1" type="number" min="0" max="5" value={degradasi} onChange={(e) => setDegradasi(Number(e.target.value))} />
                    </div>
                    <p className="text-[10px] text-slate-400">{isWind ? 'PLTB: ~0.5%/thn (keausan mekanis)' : 'PLTS: ~0.4%/thn (degradasi panel surya)'}</p>
                  </div>
                </div>
              </details>

              {/* Financial parameters */}
              <details className="group flex flex-col rounded-lg border border-gray-200 dark:border-border-dark bg-white dark:bg-card-dark overflow-hidden" open>
                <summary className="flex cursor-pointer items-center justify-between gap-4 px-4 py-3 bg-gray-50 dark:bg-[#23303d] hover:bg-gray-100 dark:hover:bg-[#2a3a4a] transition-colors">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-green-500 text-[20px]">payments</span>
                    <p className="text-slate-900 dark:text-white text-sm font-semibold">Parameter Finansial</p>
                  </div>
                  <span className="material-symbols-outlined text-slate-500 dark:text-white text-[18px] transition-transform group-open:rotate-180">expand_more</span>
                </summary>
                <div className="p-4 flex flex-col gap-5 border-t border-gray-200 dark:border-border-dark">

                  {/* CAPEX */}
                  <div className="flex flex-col gap-1.5">
                    <div className="flex justify-between items-center">
                      <label className="text-xs font-medium text-slate-500 dark:text-text-secondary uppercase tracking-wide">CAPEX (Investasi)</label>
                      <span className="text-[10px] font-bold text-green-500 bg-green-500/10 px-1.5 py-0.5 rounded">Juta USD</span>
                    </div>
                    <div className="relative">
                      <span className="absolute left-3 top-2 text-slate-500 dark:text-gray-400 text-sm">$</span>
                      <input className="w-full bg-gray-50 dark:bg-[#111a22] border border-gray-200 dark:border-border-dark rounded px-3 py-1.5 pl-6 text-sm font-medium text-slate-900 dark:text-white focus:outline-none focus:border-primary" type="number" min="0.1" step="0.5" value={capex} onChange={(e) => setCapex(Number(e.target.value))} />
                    </div>
                    <p className="text-[10px] text-slate-400">
                      {isWind ? 'Ref. PLTB Indonesia: $1.0–1.5 M/MW' : 'Ref. PLTS Indonesia: $0.8–1.2 M/MWp'}
                    </p>
                  </div>

                  {/* OPEX */}
                  <div className="flex flex-col gap-1.5">
                    <div className="flex justify-between items-center">
                      <label className="text-xs font-medium text-slate-500 dark:text-text-secondary uppercase tracking-wide">OPEX (Per Tahun)</label>
                      <span className="text-[10px] font-bold text-green-500 bg-green-500/10 px-1.5 py-0.5 rounded">% CAPEX</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <input className="flex-1" max="5" min="0.5" step="0.1" type="range" value={opex} onChange={(e) => setOpex(Number(e.target.value))} />
                      <input className="w-16 bg-gray-50 dark:bg-[#111a22] border border-gray-200 dark:border-border-dark rounded px-2 py-1.5 text-right text-sm font-medium text-slate-900 dark:text-white focus:outline-none focus:border-primary" step="0.1" type="number" min="0.5" max="5" value={opex} onChange={(e) => setOpex(Number(e.target.value))} />
                    </div>
                    <p className="text-[10px] text-slate-400">
                      {isWind ? 'PLTB: ~2–3% CAPEX/thn (maintenance turbin)' : 'PLTS: ~1–2% CAPEX/thn (cleaning, inverter)'}
                    </p>
                  </div>

                  {/* Diskonto */}
                  <div className="flex flex-col gap-1.5">
                    <div className="flex justify-between items-center">
                      <label className="text-xs font-medium text-slate-500 dark:text-text-secondary uppercase tracking-wide">Suku Bunga / Diskonto</label>
                      <span className="text-[10px] font-bold text-green-500 bg-green-500/10 px-1.5 py-0.5 rounded">%</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <input className="flex-1" max="20" min="1" step="0.1" type="range" value={diskonto} onChange={(e) => setDiskonto(Number(e.target.value))} />
                      <input className="w-16 bg-gray-50 dark:bg-[#111a22] border border-gray-200 dark:border-border-dark rounded px-2 py-1.5 text-right text-sm font-medium text-slate-900 dark:text-white focus:outline-none focus:border-primary" step="0.1" type="number" min="1" max="20" value={diskonto} onChange={(e) => setDiskonto(Number(e.target.value))} />
                    </div>
                  </div>

                  {/* Tarif */}
                  <div className="flex flex-col gap-1.5">
                    <div className="flex justify-between items-center">
                      <label className="text-xs font-medium text-slate-500 dark:text-text-secondary uppercase tracking-wide">Harga Jual Listrik</label>
                      <span className="text-[10px] font-bold text-green-500 bg-green-500/10 px-1.5 py-0.5 rounded">USD/MWh</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <input className="flex-1" max="200" min="20" step="5" type="range" value={tarif} onChange={(e) => setTarif(Number(e.target.value))} />
                      <input className="w-16 bg-gray-50 dark:bg-[#111a22] border border-gray-200 dark:border-border-dark rounded px-2 py-1.5 text-right text-sm font-medium text-slate-900 dark:text-white focus:outline-none focus:border-primary" step="5" type="number" min="20" max="200" value={tarif} onChange={(e) => setTarif(Number(e.target.value))} />
                    </div>
                  </div>
                </div>
              </details>

              {/* Formula reference */}
              <div className="bg-white dark:bg-card-dark rounded-lg border border-gray-200 dark:border-border-dark p-3 text-xs text-slate-500 dark:text-text-secondary">
                <p className="font-semibold text-slate-700 dark:text-slate-200 mb-1.5">Rumus Kalkulasi</p>
                {isWind ? (
                  <>
                    <p>AEP = Kapasitas &times; CF &times; 8.760 jam</p>
                    <p>LCOE = (CAPEX + &Sigma;OPEX) / &Sigma;AEP (diskonto)</p>
                    <p>NPV = &Sigma;(Pendapatan &minus; OPEX) / (1+r)&sup t; &minus; CAPEX</p>
                  </>
                ) : (
                  <>
                    <p>AEP = MWp &times; GHI &times; 365 &times; PR</p>
                    <p>LCOE = (CAPEX + &Sigma;OPEX) / &Sigma;AEP (diskonto)</p>
                    <p>NPV = &Sigma;(Pendapatan &minus; OPEX) / (1+r)&sup t; &minus; CAPEX</p>
                  </>
                )}
              </div>
            </div>
          </aside>

          {/* ─── Results section ────────────────────────────────────────────── */}
          <section className="lg:col-span-8 xl:col-span-8 flex flex-col gap-5">
            <div className="flex justify-between items-center">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Hasil Simulasi &mdash; {isWind ? 'PLTB' : 'PLTS'}
              </h3>
              <div className={`text-xs px-2.5 py-1 rounded-full font-bold border ${isViable ? 'bg-green-500/10 border-green-500/30 text-green-400' : 'bg-red-500/10 border-red-500/30 text-red-400'}`}>
                {isViable ? 'NPV Positif — Layak' : 'NPV Negatif — Tidak Layak'}
              </div>
            </div>

            {/* KPI cards */}
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
              <div className="bg-white dark:bg-card-dark rounded-xl p-4 border border-gray-200 dark:border-border-dark relative overflow-hidden group">
                <div className="absolute right-0 top-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
                  <span className={`material-symbols-outlined text-[56px] ${accentClass}`}>{isWind ? 'bolt' : 'solar_power'}</span>
                </div>
                <p className="text-xs text-slate-500 dark:text-text-secondary font-medium uppercase tracking-wide mb-1.5">
                  {isWind ? 'AEP PLTB (Thn-1)' : 'AEP PLTS (Thn-1)'}
                </p>
                <div className="flex items-baseline gap-1">
                  <h4 className="text-2xl font-bold text-slate-900 dark:text-white">{kpis.aepY1.toFixed(2)}</h4>
                  <span className="text-xs font-bold text-slate-400">GWh</span>
                </div>
                <p className="text-[10px] text-slate-400 mt-1">
                  {isWind ? `CF = ${faktorKapasitas}%` : `GHI × PR = ${performanceRatio}%`}
                </p>
              </div>

              <div className="bg-white dark:bg-card-dark rounded-xl p-4 border border-gray-200 dark:border-border-dark relative overflow-hidden group">
                <div className="absolute right-0 top-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
                  <span className="material-symbols-outlined text-[56px] text-yellow-500">price_check</span>
                </div>
                <p className="text-xs text-slate-500 dark:text-text-secondary font-medium uppercase tracking-wide mb-1.5">LCOE</p>
                <div className="flex items-baseline gap-1">
                  <h4 className="text-2xl font-bold text-slate-900 dark:text-white">{kpis.lcoeCents.toFixed(2)}</h4>
                  <span className="text-xs font-bold text-slate-400">¢/kWh</span>
                </div>
                <p className="text-[10px] text-slate-400 mt-1">Levelized Cost of Energy</p>
              </div>

              <div className="bg-white dark:bg-card-dark rounded-xl p-4 border border-gray-200 dark:border-border-dark relative overflow-hidden group">
                <div className="absolute right-0 top-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
                  <span className="material-symbols-outlined text-[56px] text-green-500">account_balance_wallet</span>
                </div>
                <p className="text-xs text-slate-500 dark:text-text-secondary font-medium uppercase tracking-wide mb-1.5">NPV</p>
                <div className="flex items-baseline gap-1">
                  <h4 className={`text-2xl font-bold ${kpis.npv >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {kpis.npv >= 0 ? '+' : ''}{kpis.npv.toFixed(1)}
                  </h4>
                  <span className="text-xs font-bold text-slate-400">M USD</span>
                </div>
                <p className={`text-[10px] mt-1 font-medium ${kpis.npv >= 0 ? 'text-green-500' : 'text-red-400'}`}>
                  {kpis.npv >= 0 ? 'Layak Secara Finansial' : 'Tidak Layak'}
                </p>
              </div>

              <div className="bg-white dark:bg-card-dark rounded-xl p-4 border border-gray-200 dark:border-border-dark relative overflow-hidden group">
                <div className="absolute right-0 top-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
                  <span className="material-symbols-outlined text-[56px] text-purple-500">timelapse</span>
                </div>
                <p className="text-xs text-slate-500 dark:text-text-secondary font-medium uppercase tracking-wide mb-1.5">Periode Pengembalian</p>
                <div className="flex items-baseline gap-1">
                  <h4 className="text-2xl font-bold text-slate-900 dark:text-white">{kpis.payback.toFixed(1)}</h4>
                  <span className="text-xs font-bold text-slate-400">Tahun</span>
                </div>
                <p className="text-[10px] text-slate-400 mt-1">ROI total: {kpis.roi.toFixed(1)}%</p>
              </div>

              <div className="bg-white dark:bg-card-dark rounded-xl p-4 border border-gray-200 dark:border-border-dark relative overflow-hidden group">
                <div className="absolute right-0 top-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
                  <span className="material-symbols-outlined text-[56px] text-pink-500">trending_up</span>
                </div>
                <p className="text-xs text-slate-500 dark:text-text-secondary font-medium uppercase tracking-wide mb-1.5">IRR</p>
                <div className="flex items-baseline gap-1">
                  {kpis.irr !== null ? (
                    <>
                      <h4 className={`text-2xl font-bold ${kpis.irr >= diskonto ? 'text-green-400' : 'text-red-400'}`}>
                        {kpis.irr.toFixed(1)}
                      </h4>
                      <span className="text-xs font-bold text-slate-400">%</span>
                    </>
                  ) : (
                    <h4 className="text-2xl font-bold text-slate-400">N/A</h4>
                  )}
                </div>
                <p className={`text-[10px] mt-1 font-medium ${kpis.irr !== null && kpis.irr >= diskonto ? 'text-green-500' : 'text-slate-400'}`}>
                  {kpis.irr !== null
                    ? kpis.irr >= diskonto
                      ? `✓ IRR ≥ Diskonto (${diskonto}%)`
                      : `× IRR < Diskonto (${diskonto}%)`
                    : 'Tidak dapat dihitung'}
                </p>
              </div>
            </div>

            {/* Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {/* Cumulative cash flow */}
              <div className="bg-white dark:bg-card-dark rounded-xl p-5 border border-gray-200 dark:border-border-dark flex flex-col">
                <div className="flex justify-between items-start mb-5">
                  <h4 className="text-sm font-bold text-slate-900 dark:text-white">Arus Kas Kumulatif</h4>
                  <div className="flex gap-2 items-center">
                    <span className={`size-2.5 rounded-full ${isWind ? 'bg-primary/20 border border-primary' : 'bg-amber-400/20 border border-amber-400'}`} />
                    <span className="text-xs text-slate-500 dark:text-text-secondary">Proyeksi</span>
                  </div>
                </div>
                <div className="flex-1 w-full relative min-h-50 flex items-end px-4 pb-6 border-l border-b border-gray-200 dark:border-slate-700">
                  <div className="absolute -left-7 top-0 bottom-6 flex flex-col justify-between text-[10px] text-slate-400 font-mono h-full">
                    <span>+</span><span></span><span>0</span><span></span><span>-</span>
                  </div>
                  <svg className="w-full h-full overflow-visible" preserveAspectRatio="none" viewBox="0 0 100 100">
                    <defs>
                      <linearGradient id="cashGrad" x1="0%" x2="0%" y1="0%" y2="100%">
                        <stop offset="0%" style={{ stopColor: isWind ? '#137fec' : '#f59e0b', stopOpacity: 1 }} />
                        <stop offset="100%" style={{ stopColor: isWind ? '#137fec' : '#f59e0b', stopOpacity: 0 }} />
                      </linearGradient>
                    </defs>
                    <line x1="0" y1={cumPoints.zeroY} x2="100" y2={cumPoints.zeroY} stroke="#64748b" strokeWidth="0.5" strokeDasharray="2,2" vectorEffect="non-scaling-stroke" />
                    <path d={cumPoints.areaD} fill="url(#cashGrad)" opacity="0.2" />
                    <path d={cumPoints.pathD} fill="none" stroke={isWind ? '#137fec' : '#f59e0b'} strokeLinejoin="round" strokeWidth="2" vectorEffect="non-scaling-stroke" />
                    {kpis.payback < umurProyek && (
                      <circle cx={Math.min(95, (kpis.payback / umurProyek) * 100)} cy={cumPoints.zeroY} fill={isWind ? '#137fec' : '#f59e0b'} r="1.5" className="animate-pulse" />
                    )}
                  </svg>
                  <div className="absolute left-0 right-0 -bottom-5 flex justify-between text-[10px] text-slate-400 font-mono w-full">
                    <span>Y0</span><span>Y{Math.round(umurProyek*0.25)}</span><span>Y{Math.round(umurProyek*0.5)}</span><span>Y{Math.round(umurProyek*0.75)}</span><span>Y{umurProyek}</span>
                  </div>
                </div>
              </div>

              {/* Revenue vs cost bar chart */}
              <div className="bg-white dark:bg-card-dark rounded-xl p-5 border border-gray-200 dark:border-border-dark flex flex-col">
                <div className="flex justify-between items-start mb-5">
                  <h4 className="text-sm font-bold text-slate-900 dark:text-white">Pendapatan vs Biaya</h4>
                  <div className="flex gap-4">
                    <div className="flex items-center gap-2">
                      <span className={`size-2.5 rounded-full ${accentBg}`} />
                      <span className="text-xs text-slate-500 dark:text-text-secondary">Pendapatan</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="size-2.5 rounded-full bg-slate-400" />
                      <span className="text-xs text-slate-500 dark:text-text-secondary">Biaya</span>
                    </div>
                  </div>
                </div>
                <div className="flex-1 flex items-end justify-between gap-2 border-b border-gray-200 dark:border-slate-700 pb-2 px-2 relative min-h-50">
                  <div className="absolute inset-0 flex flex-col justify-between pointer-events-none">
                    {[0,1,2,3].map((i) => <div key={i} className="w-full h-px bg-gray-100 dark:bg-slate-800" />)}
                    <div className="w-full h-px bg-transparent" />
                  </div>
                  {barData.map((bar) => (
                    <div key={bar.label} className="flex flex-col gap-1 items-center w-full group cursor-pointer">
                      <div className="flex gap-1 h-28 items-end">
                        <div className={`w-3 md:w-4 ${accentBg} rounded-t-sm ${isWind ? 'group-hover:bg-blue-400' : 'group-hover:bg-amber-300'} transition-colors`} style={{ height: `${bar.rev}%` }} />
                        <div className="w-3 md:w-4 bg-slate-400 rounded-t-sm" style={{ height: `${bar.cost}%` }} />
                      </div>
                      <span className="text-[10px] text-slate-400">{bar.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Cash flow table */}
            <div className="bg-white dark:bg-card-dark rounded-xl border border-gray-200 dark:border-border-dark overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-200 dark:border-border-dark flex justify-between items-center">
                <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                  Rincian Arus Kas (5 Tahun Pertama)
                </h4>
                <span className="text-xs text-slate-400">
                  OPEX tetap: {((capex * opex) / 100).toFixed(2)} M USD/thn
                </span>
              </div>
              <div className="overflow-x-auto no-scrollbar">
                <table className="w-full text-sm text-left">
                  <thead className="text-xs text-slate-500 dark:text-text-secondary uppercase bg-gray-50 dark:bg-[#1a232c] border-b border-gray-200 dark:border-border-dark">
                    <tr>
                      <th className="px-5 py-3 font-bold">Tahun</th>
                      <th className="px-5 py-3 font-bold">{isWind ? 'AEP PLTB (GWh)' : 'AEP PLTS (GWh)'}</th>
                      <th className="px-5 py-3 font-bold">Pendapatan ($Jt)</th>
                      <th className="px-5 py-3 font-bold">OPEX ($Jt)</th>
                      <th className="px-5 py-3 font-bold">Arus Kas Bersih ($Jt)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-slate-800">
                    {cashFlows.slice(0, 5).map((row) => (
                      <tr key={row.year} className="bg-white dark:bg-card-dark hover:bg-gray-50 dark:hover:bg-slate-800/50 transition-colors">
                        <td className="px-5 py-3 font-medium text-slate-900 dark:text-white">{row.year}</td>
                        <td className="px-5 py-3 text-slate-600 dark:text-text-secondary font-mono">{row.energy}</td>
                        <td className="px-5 py-3 text-slate-600 dark:text-text-secondary font-mono">{row.revenue.toFixed(2)}</td>
                        <td className="px-5 py-3 text-slate-600 dark:text-text-secondary font-mono">{row.opex.toFixed(2)}</td>
                        <td className={`px-5 py-3 font-medium font-mono ${row.net >= 0 ? 'text-green-500' : 'text-red-400'}`}>
                          {row.net >= 0 ? '+' : ''}{row.net.toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        </div>
      </main>

      <Footer />
    </div>
  );
}
