'use client';

import { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import { useStations } from '@/hooks/useStations';
import type { Station } from '@/lib/stationData';

const REFERENCE_CAPACITY_MW = 10;
const WIND_P50_NET_FACTOR = 0.877;
const SOLAR_REFERENCE_PR = 78;
const DEFAULT_WIND_CAPEX_PER_MW = 1.2;
const DEFAULT_SOLAR_CAPEX_PER_MWP = 0.9;

function clampNumber(value: number, min: number, max: number, fallback: number) {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

function getWindBaselineValue(station: Station) {
  return station.windBaselineGwa ?? station.windBaselineNasa ?? station.windBaseline ?? station.windSpeed ?? null;
}

function getGhiBaselineValue(station: Station) {
  return station.ghiBaselineGsa ?? station.ghiBaselineNasa ?? station.ghiBaseline ?? station.irradiation ?? null;
}

function getWindSourceLabel(station: Station) {
  if (station.windBaselineGwa != null) return 'GWA 3.0';
  if (station.windBaselineNasa != null) return 'ERA5 (ECMWF)';
  if (station.windBaseline != null) return 'Baseline Atlas';
  return 'Terukur';
}

function getGhiSourceLabel(station: Station) {
  if (station.ghiBaselineGsa != null) return 'GSA (Solargis)';
  if (station.ghiBaselineNasa != null) return 'ERA5 (ECMWF)';
  if (station.ghiBaseline != null) return 'Baseline Atlas';
  return 'Terukur';
}

function getWindReferenceAepMwh(station: Station) {
  return station.aep && station.aep > 0 ? station.aep : station.windAep ?? null;
}

export default function KalkulatorPage() {
  useEffect(() => { document.title = 'Kalkulator | RE-Valid'; }, []);
  // --- Energy type toggle ---
  const { stations } = useStations();
  const [energyType, setEnergyType] = useState<'wind' | 'solar'>('wind');
  const isWind = energyType === 'wind';
  const [exportingPDF, setExportingPDF] = useState(false);

  // --- Station selector ---
  const [selectedStationId, setSelectedStationId] = useState<string>('none');

  // --- Technical parameters ---
  const [kapasitas, setKapasitas] = useState(50);         // MW / MWp
  const [faktorKapasitas, setFaktorKapasitas] = useState(20); // % (wind CF)
  const [performanceRatio, setPerformanceRatio] = useState(75); // % (solar PR)
  const [umurProyek, setUmurProyek] = useState(20);       // years
  const [degradasi, setDegradasi] = useState(0.5);        // % per year

  // --- Financial parameters ---
  const [capex, setCapex] = useState(60);                 // M USD  (50MW × $1.2M/MW)
  const [opex, setOpex] = useState(2.0);                  // % of CAPEX
  const [diskonto, setDiskonto] = useState(8.5);          // %
  const [tarif, setTarif] = useState(80);                 // USD/MWh

  // --- Pre-fill from station ---
  function loadFromStation(id: string) {
    if (id === 'none') { setSelectedStationId('none'); return; }
    const s = stations.find((st) => st.id === id);
    if (!s) return;
    setSelectedStationId(id);
    if (isWind) {
      // Prioritas: GWA 3.0 → ERA5 → baseline → terukur
      const referenceAep = getWindReferenceAepMwh(s);
      const speed = getWindBaselineValue(s) ?? 0;
      const cfFromAep = referenceAep && referenceAep > 0
        ? (referenceAep * WIND_P50_NET_FACTOR) / (REFERENCE_CAPACITY_MW * 8760) * 100
        : null;
      const cf = cfFromAep != null
        ? Math.round(clampNumber(cfFromAep, 5, 60, 20))
        : Math.round(clampNumber(speed * 3.8, 5, 60, 20));
      setFaktorKapasitas(cf);
      // CAPEX ref. PLTB Indonesia: ~$1.0–1.5 M/MW
      setCapex(parseFloat((kapasitas * DEFAULT_WIND_CAPEX_PER_MW).toFixed(1)));
    } else {
      // Solar: PR default 75%, CAPEX disesuaikan kapasitas
      setPerformanceRatio(75);
      // CAPEX PLTS lebih rendah (~$0.8–1.2 M/MWp) vs angin (~$1.0–1.5 M/MW)
      setCapex(parseFloat((kapasitas * DEFAULT_SOLAR_CAPEX_PER_MWP).toFixed(1)));
    }
  }

  // --- AEP Year 1 ---
  const aepY1 = useMemo(() => {
    if (isWind) {
      return (kapasitas * (faktorKapasitas / 100) * 8760) / 1000; // GWh
    } else {
      // AEP PLTS = kapasitas (MWp) × GHI (kWh/m²/day) × 365 × PR
      // Prioritas sumber GHI: GSA (Solargis) → ERA5 → baseline → irradiation terukur
      const station = stations.find((s) => s.id === selectedStationId);
      if (station?.solarAep && station.solarAep > 0) {
        return (station.solarAep / 1000) * (kapasitas / REFERENCE_CAPACITY_MW) * (performanceRatio / SOLAR_REFERENCE_PR);
      }
      const ghi = station ? (getGhiBaselineValue(station) ?? 4.5) : 4.5;
      return (kapasitas * ghi * 365 * (performanceRatio / 100)) / 1000; // GWh
    }
  }, [kapasitas, faktorKapasitas, performanceRatio, selectedStationId, isWind, stations]);

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
    let payback: number | null = null;
    for (const cf of cashFlows) {
      const prev = cumulative;
      cumulative += cf.net;
      if (cumulative >= 0 && cf.net > 0) {
        payback = cf.year - 1 + (-prev / cf.net);
        break;
      }
    }

    const totalNet = cashFlows.reduce((acc, cf) => acc + cf.net, 0);
    const roi = capex > 0 ? (totalNet / capex) * 100 : 0;

    // ── IRR via Newton-Raphson ────────────────────────────────────
    const flows = [-capex, ...cashFlows.map((cf) => cf.net)];
    const hasPositiveFlow = flows.some((flow) => flow > 0);
    const hasNegativeFlow = flows.some((flow) => flow < 0);
    let irrPct: number | null = null;
    if (hasPositiveFlow && hasNegativeFlow) {
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
      irrPct = Number.isFinite(irr) ? irr * 100 : null;
    }

    return {
      aepY1,
      npv: parseFloat(npv.toFixed(1)),
      lcoeCents: parseFloat(lcoeCents.toFixed(2)),
      payback: payback !== null ? parseFloat(payback.toFixed(1)) : null,
      roi: parseFloat(roi.toFixed(1)),
      irr: irrPct !== null ? parseFloat(irrPct.toFixed(1)) : null,
    };
  }, [cashFlows, capex, diskonto, aepY1]);

  const cashFlowSummary = useMemo(() => {
    const r = diskonto / 100;
    const totalEnergy = cashFlows.reduce((acc, cf) => acc + cf.energy, 0);
    const totalRevenue = cashFlows.reduce((acc, cf) => acc + cf.revenue, 0);
    const totalOpex = cashFlows.reduce((acc, cf) => acc + cf.opex, 0);
    const totalNet = cashFlows.reduce((acc, cf) => acc + cf.net, 0);
    const discountedRevenue = cashFlows.reduce((acc, cf) => acc + cf.revenue / Math.pow(1 + r, cf.year), 0);
    const discountedOpex = cashFlows.reduce((acc, cf) => acc + cf.opex / Math.pow(1 + r, cf.year), 0);
    const discountedNet = cashFlows.reduce((acc, cf) => acc + cf.net / Math.pow(1 + r, cf.year), 0);

    return {
      totalEnergy,
      totalRevenue,
      totalOpex,
      totalNet,
      endingCumulative: totalNet - capex,
      discountedRevenue,
      discountedOpex,
      discountedNet,
    };
  }, [cashFlows, capex, diskonto]);

  const barData = cashFlows.filter((_, i) => i % 2 === 0).slice(0, 6).map((cf) => ({
    label: `Y${cf.year}`,
    rev: Math.min(100, Math.round((cf.revenue / (cashFlows[0]?.revenue ?? 1)) * 80)),
    cost: Math.min(100, Math.round((cf.opex / (cashFlows[0]?.revenue ?? 1)) * 80)),
  }));

  const isViable = kpis.npv >= 0;
  const selectedStation = stations.find((s) => s.id === selectedStationId);
  const selectedWindAepMwh = selectedStation ? getWindReferenceAepMwh(selectedStation) : null;
  const selectedWindNetAepMwh = selectedWindAepMwh && selectedWindAepMwh > 0 ? selectedWindAepMwh * WIND_P50_NET_FACTOR : null;
  const selectedSolarAepMwh = selectedStation?.solarAep && selectedStation.solarAep > 0 ? selectedStation.solarAep : null;
  const activeGhiValue = selectedStation ? getGhiBaselineValue(selectedStation) : null;
  const aepBasisText = isWind
    ? selectedWindNetAepMwh
      ? `AEP P50 net stasiun @10 MW: ${Math.round(selectedWindNetAepMwh).toLocaleString('id-ID')} MWh/thn`
      : `CF manual dari ${selectedStation ? getWindSourceLabel(selectedStation) : 'input user'}`
    : selectedSolarAepMwh
      ? `AEP PLTS stasiun @10 MWp PR 78%: ${Math.round(selectedSolarAepMwh).toLocaleString('id-ID')} MWh/thn`
      : `GHI ${activeGhiValue ?? 4.5} kWh/m2/hari`;
  const accentClass = isWind ? 'text-primary' : 'text-amber-400';
  const accentBg = isWind ? 'bg-primary' : 'bg-amber-500';
  const accentBgLight = isWind ? 'bg-primary/10' : 'bg-amber-500/10';

  function handleReset() {
    setKapasitas(50);
    setFaktorKapasitas(20);
    setPerformanceRatio(75);
    setUmurProyek(20);
    setDegradasi(isWind ? 0.5 : 0.4);
    setCapex(isWind ? 50 * DEFAULT_WIND_CAPEX_PER_MW : 50 * DEFAULT_SOLAR_CAPEX_PER_MWP);
    setOpex(isWind ? 2.0 : 1.5);
    setDiskonto(8.5);
    setTarif(80);
    setSelectedStationId('none');
  }

  function handleEnergyToggle(type: 'wind' | 'solar') {
    setEnergyType(type);
    setSelectedStationId('none');
    if (type === 'wind') {
      setFaktorKapasitas(20);
      setCapex(50 * DEFAULT_WIND_CAPEX_PER_MW);
      setDegradasi(0.5);
      setOpex(2.0);
    } else {
      setFaktorKapasitas(20);
      setCapex(50 * DEFAULT_SOLAR_CAPEX_PER_MWP);
      setDegradasi(0.4); // PLTS degradasi panel ~0.4%/thn
      setOpex(1.5);
    }
  }

  async function handleExportPDF() {
    setExportingPDF(true);
    try {
      const { default: jsPDF } = await import('jspdf');
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const W = pdf.internal.pageSize.getWidth();
      const H = pdf.internal.pageSize.getHeight();
      const marginX = 10;
      const footerY = H - 10;
      const exportedAt = new Date().toLocaleString('id-ID');
      const projectName = `Simulasi ${isWind ? 'PLTB (Angin)' : 'PLTS (Surya)'}`;
      const energyUnit = isWind ? 'MW' : 'MWp';
      const money = (value: number, digits = 2) => `${value >= 0 ? '+' : ''}${value.toFixed(digits)}`;
      const plainMoney = (value: number, digits = 2) => value.toFixed(digits);
      const splitText = (text: string, maxWidth: number) => pdf.splitTextToSize(text, maxWidth) as string[];
      const drawHeader = (subtitle = 'Kalkulator Energi & Ekonomi') => {
        pdf.setFillColor(19, 127, 236);
        pdf.rect(0, 0, W, 14, 'F');
        pdf.setTextColor(255, 255, 255);
        pdf.setFontSize(11);
        pdf.setFont('helvetica', 'bold');
        pdf.text('RE-Valid — Kalkulator Energi & Ekonomi', marginX, 9.5);
        pdf.setFontSize(8);
        pdf.setFont('helvetica', 'normal');
        pdf.text(subtitle, W - marginX, 9.5, { align: 'right' });
      };
      const ensureSpace = (needed: number, subtitle?: string) => {
        if (y + needed <= footerY - 6) return;
        pdf.addPage();
        y = 20;
        drawHeader(subtitle);
      };
      const sectionTitle = (title: string, subtitle?: string) => {
        ensureSpace(subtitle ? 15 : 10);
        pdf.setFontSize(10);
        pdf.setFont('helvetica', 'bold');
        pdf.setTextColor(30, 30, 30);
        pdf.text(title, marginX, y);
        y += 5;
        if (subtitle) {
          pdf.setFontSize(7.5);
          pdf.setFont('helvetica', 'normal');
          pdf.setTextColor(100, 100, 100);
          pdf.text(subtitle, marginX, y);
          y += 5;
        }
      };
      let y = 18;

      // Header
      drawHeader(`Diekspor: ${exportedAt}`);
      pdf.setFontSize(8);
      pdf.setFont('helvetica', 'normal');

      // Title
      pdf.setTextColor(30, 30, 30);
      pdf.setFontSize(14);
      pdf.setFont('helvetica', 'bold');
      pdf.text(projectName, marginX, y);
      y += 7;

      // Parameter summary
      pdf.setFontSize(9);
      pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(80, 80, 80);
      const stationLine = selectedStation
        ? `Stasiun Referensi: ${selectedStation.name} (${selectedStation.id}) | ${selectedStation.region} | Skor GIS ${selectedStation.score}/100 | MCP ${selectedStation.mcpStatus}`
        : 'Stasiun: Manual (tidak ada stasiun dipilih)';
      const baselineLine = selectedStation
        ? isWind
          ? `Basis Energi: ${aepBasisText}; baseline angin ${getWindBaselineValue(selectedStation) ?? '-'} m/s (${getWindSourceLabel(selectedStation)})`
          : `Basis Energi: ${aepBasisText}; GHI ${getGhiBaselineValue(selectedStation) ?? '-'} kWh/m2/hari (${getGhiSourceLabel(selectedStation)})`
        : `Basis Energi: ${aepBasisText}`;
      const paramLines = [
        `Kapasitas: ${kapasitas} ${energyUnit}  |  ${isWind ? `CF: ${faktorKapasitas}%` : `PR: ${performanceRatio}%`}  |  Umur Proyek: ${umurProyek} thn  |  Degradasi: ${degradasi}%/thn`,
        `CAPEX: $${capex} Jt  |  OPEX: ${opex}% CAPEX/thn  |  Diskonto: ${diskonto}%  |  Tarif: $${tarif}/MWh`,
        stationLine,
        baselineLine,
      ];
      paramLines.forEach((line) => {
        splitText(line, W - 20).forEach((wrappedLine) => {
          pdf.text(wrappedLine, marginX, y);
          y += 4.5;
        });
      });
      y += 3;

      // KPI section (6 columns: AEP, LCOE, NPV, Payback, IRR, ROI)
      pdf.setDrawColor(200, 200, 200);
      pdf.setFillColor(245, 247, 250);
      pdf.rect(10, y, W - 20, 28, 'FD');
      const kpiLabels = ['AEP Thn-1 (GWh)', 'LCOE (¢/kWh)', 'NPV ($Jt)', 'Payback (Thn)', 'IRR (%)', 'ROI (%)'];
      const kpiVals = [
        kpis.aepY1.toFixed(2),
        kpis.lcoeCents.toFixed(2),
        `${kpis.npv >= 0 ? '+' : ''}${kpis.npv.toFixed(1)}`,
        kpis.payback !== null ? kpis.payback.toFixed(1) : `>${umurProyek}`,
        kpis.irr !== null ? `${kpis.irr.toFixed(1)}%` : 'N/A',
        `${kpis.roi >= 0 ? '+' : ''}${kpis.roi.toFixed(1)}%`,
      ];
      const colW = (W - 20) / 6;
      kpiLabels.forEach((lbl, i) => {
        const x = 10 + i * colW + colW / 2;
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(7);
        pdf.setTextColor(100, 100, 100);
        pdf.text(lbl, x, y + 8, { align: 'center' });
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(11);
        const isGreen = (i === 2 && kpis.npv >= 0) || (i === 5 && kpis.roi >= 0);
        const isRed = (i === 2 && kpis.npv < 0) || (i === 5 && kpis.roi < 0);
        if (isGreen) pdf.setTextColor(34, 197, 94);
        else if (isRed) pdf.setTextColor(220, 38, 38);
        else pdf.setTextColor(19, 127, 236);
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

        if (kpis.payback !== null && kpis.payback < umurProyek) {
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

      sectionTitle('Ringkasan Kelayakan', 'Ikhtisar total selama umur proyek berdasarkan parameter aktif.');
      {
        const rows = [
          ['Status Finansial', isViable ? 'Layak (NPV positif)' : 'Tidak layak (NPV negatif)', isViable ? 'good' : 'bad'],
          ['AEP Total Proyek', `${cashFlowSummary.totalEnergy.toFixed(2)} GWh`, 'neutral'],
          ['Pendapatan Total', `$${plainMoney(cashFlowSummary.totalRevenue)} Jt`, 'neutral'],
          ['OPEX Total', `$${plainMoney(cashFlowSummary.totalOpex)} Jt`, 'neutral'],
          ['Pendapatan Terdiskonto', `$${plainMoney(cashFlowSummary.discountedRevenue)} Jt`, 'neutral'],
          ['OPEX Terdiskonto', `$${plainMoney(cashFlowSummary.discountedOpex)} Jt`, 'neutral'],
          ['Arus Kas Bersih Total', `${money(cashFlowSummary.totalNet)} $Jt`, cashFlowSummary.totalNet >= 0 ? 'good' : 'bad'],
          ['Arus Kas Akhir Setelah CAPEX', `${money(cashFlowSummary.endingCumulative, 1)} $Jt`, cashFlowSummary.endingCumulative >= 0 ? 'good' : 'bad'],
          ['NPV @ Diskonto', `${money(kpis.npv, 1)} $Jt`, kpis.npv >= 0 ? 'good' : 'bad'],
          ['IRR vs Diskonto', kpis.irr !== null ? `${kpis.irr.toFixed(1)}% vs ${diskonto}%` : 'Tidak dapat dihitung', kpis.irr !== null && kpis.irr >= diskonto ? 'good' : 'bad'],
        ] as const;
        const rowH = 6.8;
        const colW2 = (W - 24) / 2;
        ensureSpace(Math.ceil(rows.length / 2) * rowH + 4);
        rows.forEach(([label, value, tone], idx) => {
          const col = idx % 2;
          const row = Math.floor(idx / 2);
          const boxX = marginX + col * (colW2 + 4);
          const boxY = y + row * rowH;
          pdf.setFillColor(248, 250, 252);
          pdf.setDrawColor(225, 230, 235);
          pdf.rect(boxX, boxY, colW2, rowH - 1, 'FD');
          pdf.setFontSize(6.2);
          pdf.setFont('helvetica', 'normal');
          pdf.setTextColor(100, 100, 100);
          pdf.text(label, boxX + 2, boxY + 2.7);
          pdf.setFontSize(7.3);
          pdf.setFont('helvetica', 'bold');
          if (tone === 'good') pdf.setTextColor(22, 163, 74);
          else if (tone === 'bad') pdf.setTextColor(185, 28, 28);
          else pdf.setTextColor(30, 30, 30);
          pdf.text(value, boxX + colW2 - 2, boxY + 5.1, { align: 'right' });
        });
        y += Math.ceil(rows.length / 2) * rowH + 5;
      }

      ensureSpace(52, 'Kalkulator Energi & Ekonomi');
      sectionTitle('Pendapatan vs OPEX', 'Sampel tahun proyek untuk membandingkan pendapatan energi dan biaya operasi.');
      {
        const step = Math.max(1, Math.floor(umurProyek / 6));
        const samples = cashFlows.filter((_, idx) => idx % step === 0).slice(0, 6);
        const bX = 20;
        const bW = W - 40;
        const bH = 30;
        const maxBar = Math.max(...samples.flatMap((cf) => [cf.revenue, cf.opex]), 1);
        ensureSpace(bH + 14);
        const baseY = y + bH;
        pdf.setDrawColor(220, 225, 230);
        pdf.setLineWidth(0.25);
        pdf.line(bX, y, bX, baseY);
        pdf.line(bX, baseY, bX + bW, baseY);
        for (let gi = 1; gi <= 3; gi++) {
          const gridY = y + (gi / 4) * bH;
          pdf.setDrawColor(235, 238, 242);
          pdf.line(bX, gridY, bX + bW, gridY);
        }
        samples.forEach((cf, idx) => {
          const groupW = bW / samples.length;
          const centerX = bX + idx * groupW + groupW / 2;
          const revH = (cf.revenue / maxBar) * (bH - 3);
          const opexH = (cf.opex / maxBar) * (bH - 3);
          pdf.setFillColor(isWind ? 19 : 245, isWind ? 127 : 158, isWind ? 236 : 11);
          pdf.rect(centerX - 3.5, baseY - revH, 3, revH, 'F');
          pdf.setFillColor(148, 163, 184);
          pdf.rect(centerX + 0.8, baseY - opexH, 3, opexH, 'F');
          pdf.setFontSize(6);
          pdf.setTextColor(100, 100, 100);
          pdf.text(`Y${cf.year}`, centerX, baseY + 4, { align: 'center' });
        });
        pdf.setFontSize(7);
        pdf.setTextColor(60, 60, 60);
        pdf.setFillColor(isWind ? 19 : 245, isWind ? 127 : 158, isWind ? 236 : 11);
        pdf.rect(W - 62, y + 1, 3, 3, 'F');
        pdf.text('Pendapatan', W - 57, y + 4);
        pdf.setFillColor(148, 163, 184);
        pdf.rect(W - 31, y + 1, 3, 3, 'F');
        pdf.text('OPEX', W - 26, y + 4);
        y += bH + 12;
      }

      sectionTitle('Metodologi & Asumsi', 'Formula yang digunakan di simulasi ekonomi.');
      {
        const methodLines = [
          isWind
            ? 'AEP tahun pertama = Kapasitas x CF x 8.760 jam; AEP tahun berikutnya mengikuti degradasi tahunan.'
            : 'AEP tahun pertama = Kapasitas MWp x GHI x 365 x PR; AEP tahun berikutnya mengikuti degradasi tahunan.',
          'Pendapatan = AEP (MWh) x tarif listrik. OPEX dihitung tetap sebagai persentase CAPEX per tahun.',
          'LCOE, NPV, dan arus kas terdiskonto memakai tingkat diskonto aktif; payback memakai arus kas kumulatif sederhana.',
        ];
        const wrappedMethodLines = methodLines.flatMap((line) => splitText(line, W - 28));
        const methodBoxH = wrappedMethodLines.length * 4.5 + 7;
        ensureSpace(methodBoxH + 2);
        pdf.setFillColor(248, 250, 252);
        pdf.setDrawColor(225, 230, 235);
        pdf.roundedRect(marginX, y - 2, W - 20, methodBoxH, 1.5, 1.5, 'FD');
        pdf.setFontSize(7.3);
        pdf.setFont('helvetica', 'normal');
        pdf.setTextColor(70, 70, 70);
        methodLines.forEach((line) => {
          splitText(line, W - 28).forEach((wrappedLine, idx) => {
            pdf.text(`${idx === 0 ? '-' : ' '} ${wrappedLine}`, marginX + 3, y + 2);
            y += 4.5;
          });
        });
        y += 3;
      }

      // ── Rincian Arus Kas ─────────────────────────────────────────────────
      ensureSpace(50, `${isWind ? 'PLTB' : 'PLTS'} - Rincian Arus Kas`);
      y += 2;

      // Cash flow table
      pdf.setFontSize(10);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(30, 30, 30);
      pdf.text('Rincian Arus Kas', 10, y);
      y += 5;
      pdf.setFontSize(7.5);
      pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(100, 100, 100);
      pdf.text(`CAPEX tahun 0: $${plainMoney(capex, 1)} Jt. Nilai diskonto memakai tingkat ${diskonto}% per tahun.`, 10, y);
      y += 5;

      const headers = ['Thn', 'AEP (GWh)', 'Pendapatan ($Jt)', 'OPEX ($Jt)', 'Bersih ($Jt)', 'Kumulatif ($Jt)', 'Diskonto ($Jt)'];
      const cols = [12, 24, 30, 22, 28, 34, 35];
      let x = 10;
      const drawCfHeader = () => {
        x = 10;
        pdf.setFillColor(235, 240, 248);
        pdf.rect(10, y, W - 20, 7, 'F');
        pdf.setFontSize(6.7);
        pdf.setFont('helvetica', 'bold');
        pdf.setTextColor(60, 60, 60);
        headers.forEach((h, i) => {
          pdf.text(h, i === 0 ? x + 2 : x + cols[i] - 2, y + 5, { align: i === 0 ? 'left' : 'right' });
          x += cols[i];
        });
        y += 7;
      };
      drawCfHeader();

      let cumulativeCashFlow = -capex;
      cashFlows.forEach((row, rowIdx) => {
        if (y > footerY - 18) {
          pdf.addPage();
          y = 18;
          drawHeader(`${isWind ? 'PLTB' : 'PLTS'} - Rincian Arus Kas (lanjutan)`);
          drawCfHeader();
        }
        cumulativeCashFlow += row.net;
        const discountedNet = row.net / Math.pow(1 + diskonto / 100, row.year);
        x = 10;
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(7.1);
        pdf.setTextColor(40, 40, 40);
        if (rowIdx % 2 === 0) { pdf.setFillColor(250, 250, 252); pdf.rect(10, y, W - 20, 6.2, 'F'); }
        const cells = [
          String(row.year),
          row.energy.toFixed(2),
          row.revenue.toFixed(2),
          row.opex.toFixed(2),
          money(row.net),
          money(cumulativeCashFlow),
          money(discountedNet),
        ];
        cells.forEach((c, i) => {
          const toneValue = i === 4 ? row.net : i === 5 ? cumulativeCashFlow : i === 6 ? discountedNet : null;
          if (toneValue !== null) pdf.setTextColor(toneValue >= 0 ? 22 : 185, toneValue >= 0 ? 163 : 28, toneValue >= 0 ? 74 : 28);
          else pdf.setTextColor(40, 40, 40);
          pdf.text(c, i === 0 ? x + 2 : x + cols[i] - 2, y + 4.3, { align: i === 0 ? 'left' : 'right' });
          x += cols[i];
        });
        y += 6.2;
      });
      y += 6;

      if (y > footerY - 26) {
        pdf.addPage();
        y = 18;
        drawHeader(`${isWind ? 'PLTB' : 'PLTS'} - Ringkasan Total`);
        drawCfHeader();
      }
      x = 10;
      pdf.setFillColor(235, 240, 248);
      pdf.rect(10, y, W - 20, 7, 'F');
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(7.1);
      const totalCells = [
        'Total',
        cashFlowSummary.totalEnergy.toFixed(2),
        plainMoney(cashFlowSummary.totalRevenue),
        plainMoney(cashFlowSummary.totalOpex),
        money(cashFlowSummary.totalNet),
        money(cashFlowSummary.endingCumulative, 1),
        money(cashFlowSummary.discountedNet),
      ];
      totalCells.forEach((c, i) => {
        const toneValue = i === 4 ? cashFlowSummary.totalNet : i === 5 ? cashFlowSummary.endingCumulative : i === 6 ? cashFlowSummary.discountedNet : null;
        if (toneValue !== null) pdf.setTextColor(toneValue >= 0 ? 22 : 185, toneValue >= 0 ? 163 : 28, toneValue >= 0 ? 74 : 28);
        else pdf.setTextColor(40, 40, 40);
        pdf.text(c, i === 0 ? x + 2 : x + cols[i] - 2, y + 4.7, { align: i === 0 ? 'left' : 'right' });
        x += cols[i];
      });
      y += 11;

      ensureSpace(20, `${isWind ? 'PLTB' : 'PLTS'} - Catatan Perhitungan`);
      pdf.setFontSize(7.4);
      pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(90, 90, 90);
      splitText(`NPV = total arus kas bersih terdiskonto ($${plainMoney(cashFlowSummary.discountedNet, 2)} Jt) - CAPEX ($${plainMoney(capex, 1)} Jt) = ${money(kpis.npv, 1)} $Jt.`, W - 20)
        .forEach((line) => { pdf.text(line, 10, y); y += 4; });

      // Footer disclaimer
      pdf.setFontSize(7);
      pdf.setFont('helvetica', 'italic');
      pdf.setTextColor(150, 150, 150);
      splitText('Catatan: simulasi screening awal. Tidak menggantikan studi kelayakan finansial atau analisis detail konsultan EBT bersertifikat.', W - 20)
        .forEach((line) => { pdf.text(line, 10, y + 4); y += 4; });

      const pageCount = pdf.getNumberOfPages();
      for (let page = 1; page <= pageCount; page++) {
        pdf.setPage(page);
        pdf.setDrawColor(225, 230, 235);
        pdf.setLineWidth(0.2);
        pdf.line(marginX, footerY - 4, W - marginX, footerY - 4);
        pdf.setFontSize(6.8);
        pdf.setFont('helvetica', 'italic');
        pdf.setTextColor(130, 130, 130);
        pdf.text('Sumber: RE-Valid DSS - ERA5/GWA/GSA', marginX, footerY);
        pdf.text(`Diekspor ${exportedAt} | Halaman ${page}/${pageCount}`, W - marginX, footerY, { align: 'right' });
      }

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
            <div className="flex gap-3 w-full sm:w-auto sm:shrink-0">
              <button
                onClick={handleExportPDF}
                disabled={exportingPDF}
                className="flex w-full sm:w-auto items-center justify-center gap-2 px-4 py-2 bg-slate-200 dark:bg-card-dark text-slate-700 dark:text-white rounded-lg hover:bg-slate-300 dark:hover:bg-border-dark transition-all text-sm font-medium disabled:opacity-60 disabled:cursor-wait"
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
        <div className="flex flex-wrap items-center gap-3 mb-5">
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
          <p className="text-[11px] text-slate-400 min-w-0">
            {isWind ? 'CF pre-fill dari AEP validasi/GWA/ERA5 jika tersedia · simulasi screening ekonomi' : 'AEP pre-fill dari solar AEP/GHI GSA/ERA5 jika tersedia · simulasi screening ekonomi'}
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
                      ? `${getWindBaselineValue(s) ?? '–'} m/s`
                      : `${getGhiBaselineValue(s) ?? '–'} kWh/m²/hari`}
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
                      ? `CF aktif: ${faktorKapasitas}% (${selectedWindNetAepMwh ? 'AEP P50 net stasiun' : getWindSourceLabel(selectedStation)})`
                      : `AEP/GHI aktif: ${selectedSolarAepMwh ? 'AEP PLTS stasiun' : `${getGhiBaselineValue(selectedStation) ?? '–'} kWh/m²/hari (${getGhiSourceLabel(selectedStation)})`}`}
                  </div>
                  <div className="grid grid-cols-2 gap-1.5 text-[11px]">
                    <div className="bg-gray-50 dark:bg-[#111a22] rounded px-2.5 py-2 flex flex-col gap-0.5">
                      <span className="text-slate-400 uppercase font-bold text-[10px]">{isWind ? 'Baseline Angin' : 'GHI Baseline'}</span>
                      <span className="font-bold text-slate-900 dark:text-white">
                        {isWind
                          ? `${getWindBaselineValue(selectedStation) ?? '–'} m/s`
                          : `${getGhiBaselineValue(selectedStation) ?? '–'} kWh/m²/d`}
                      </span>
                      <span className="text-slate-400 text-[10px]">
                        {isWind
                          ? getWindSourceLabel(selectedStation)
                          : getGhiSourceLabel(selectedStation)}
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
                      <span className={`text-[10px] font-bold ${accentClass} ${accentBgLight} px-1.5 py-0.5 rounded`}>{isWind ? 'MW' : 'MWp'}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <input className="flex-1" max="200" min="1" type="range" value={kapasitas} onChange={(e) => setKapasitas(clampNumber(Number(e.target.value), 1, 200, kapasitas))} />
                      <input className="w-16 bg-gray-50 dark:bg-[#111a22] border border-gray-200 dark:border-border-dark rounded px-2 py-1.5 text-right text-sm font-medium text-slate-900 dark:text-white focus:outline-none focus:border-primary" type="number" min="1" max="200" value={kapasitas} onChange={(e) => setKapasitas(clampNumber(Number(e.target.value), 1, 200, kapasitas))} />
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
                        <input className="flex-1" max="60" min="5" type="range" value={faktorKapasitas} onChange={(e) => setFaktorKapasitas(clampNumber(Number(e.target.value), 5, 60, faktorKapasitas))} />
                        <input className="w-16 bg-gray-50 dark:bg-[#111a22] border border-gray-200 dark:border-border-dark rounded px-2 py-1.5 text-right text-sm font-medium text-slate-900 dark:text-white focus:outline-none focus:border-primary" type="number" min="5" max="60" value={faktorKapasitas} onChange={(e) => setFaktorKapasitas(clampNumber(Number(e.target.value), 5, 60, faktorKapasitas))} />
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
                          <input className="flex-1" max="90" min="50" type="range" value={performanceRatio} onChange={(e) => setPerformanceRatio(clampNumber(Number(e.target.value), 50, 90, performanceRatio))} />
                          <input className="w-16 bg-gray-50 dark:bg-[#111a22] border border-gray-200 dark:border-border-dark rounded px-2 py-1.5 text-right text-sm font-medium text-slate-900 dark:text-white focus:outline-none" type="number" min="50" max="90" value={performanceRatio} onChange={(e) => setPerformanceRatio(clampNumber(Number(e.target.value), 50, 90, performanceRatio))} />
                        </div>
                        <p className="text-[10px] text-slate-400">Tipikal PLTS tropik: 72–80% · Mencakup rugi kabel, suhu, debu</p>
                      </div>
                      <div className="bg-amber-500/5 border border-amber-500/20 rounded-lg p-3 text-[11px]">
                        <p className="font-semibold text-amber-600 dark:text-amber-400 mb-1">Rumus AEP PLTS</p>
                        <p className="text-slate-600 dark:text-slate-300 font-mono">AEP = MWp × GHI × 365 × PR</p>
                        {selectedStation ? (
                          <p className="text-amber-500 mt-1">
                            {selectedSolarAepMwh
                              ? `Basis: AEP PLTS stasiun ${Math.round(selectedSolarAepMwh).toLocaleString('id-ID')} MWh/thn @10 MWp, PR ${SOLAR_REFERENCE_PR}%`
                              : `GHI = ${getGhiBaselineValue(selectedStation)} kWh/m²/hari (${getGhiSourceLabel(selectedStation)})`}
                          </p>
                        ) : (
                          <p className="text-slate-400 mt-1">Pilih stasiun untuk GHI aktual (prioritas: GSA → ERA5 → Terukur)</p>
                        )}
                      </div>
                    </>
                  )}

                  {/* Umur Proyek */}
                  <div className="flex flex-col gap-1.5">
                    <div className="flex justify-between items-center">
                      <label className="text-xs font-medium text-slate-500 dark:text-text-secondary uppercase tracking-wide">Umur Proyek</label>
                      <span className={`text-[10px] font-bold ${accentClass} ${accentBgLight} px-1.5 py-0.5 rounded`}>Tahun</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <input className="flex-1" max="30" min="5" type="range" value={umurProyek} onChange={(e) => setUmurProyek(clampNumber(Number(e.target.value), 5, 30, umurProyek))} />
                      <input className="w-16 bg-gray-50 dark:bg-[#111a22] border border-gray-200 dark:border-border-dark rounded px-2 py-1.5 text-right text-sm font-medium text-slate-900 dark:text-white focus:outline-none focus:border-primary" type="number" min="5" max="30" value={umurProyek} onChange={(e) => setUmurProyek(clampNumber(Number(e.target.value), 5, 30, umurProyek))} />
                    </div>
                  </div>

                  {/* Degradasi */}
                  <div className="flex flex-col gap-1.5">
                    <div className="flex justify-between items-center">
                      <label className="text-xs font-medium text-slate-500 dark:text-text-secondary uppercase tracking-wide">Degradasi Tahunan</label>
                      <span className={`text-[10px] font-bold ${accentClass} ${accentBgLight} px-1.5 py-0.5 rounded`}>%</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <input className="flex-1" max="5" min="0" step="0.1" type="range" value={degradasi} onChange={(e) => setDegradasi(clampNumber(Number(e.target.value), 0, 5, degradasi))} />
                      <input className="w-16 bg-gray-50 dark:bg-[#111a22] border border-gray-200 dark:border-border-dark rounded px-2 py-1.5 text-right text-sm font-medium text-slate-900 dark:text-white focus:outline-none focus:border-primary" step="0.1" type="number" min="0" max="5" value={degradasi} onChange={(e) => setDegradasi(clampNumber(Number(e.target.value), 0, 5, degradasi))} />
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
                      <input className="w-full bg-gray-50 dark:bg-[#111a22] border border-gray-200 dark:border-border-dark rounded px-3 py-1.5 pl-6 text-sm font-medium text-slate-900 dark:text-white focus:outline-none focus:border-primary" type="number" min="0.1" step="0.5" value={capex} onChange={(e) => setCapex(clampNumber(Number(e.target.value), 0.1, 1000, capex))} />
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
                      <input className="flex-1" max="5" min="0.5" step="0.1" type="range" value={opex} onChange={(e) => setOpex(clampNumber(Number(e.target.value), 0.5, 5, opex))} />
                      <input className="w-16 bg-gray-50 dark:bg-[#111a22] border border-gray-200 dark:border-border-dark rounded px-2 py-1.5 text-right text-sm font-medium text-slate-900 dark:text-white focus:outline-none focus:border-primary" step="0.1" type="number" min="0.5" max="5" value={opex} onChange={(e) => setOpex(clampNumber(Number(e.target.value), 0.5, 5, opex))} />
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
                      <input className="flex-1" max="20" min="1" step="0.1" type="range" value={diskonto} onChange={(e) => setDiskonto(clampNumber(Number(e.target.value), 1, 20, diskonto))} />
                      <input className="w-16 bg-gray-50 dark:bg-[#111a22] border border-gray-200 dark:border-border-dark rounded px-2 py-1.5 text-right text-sm font-medium text-slate-900 dark:text-white focus:outline-none focus:border-primary" step="0.1" type="number" min="1" max="20" value={diskonto} onChange={(e) => setDiskonto(clampNumber(Number(e.target.value), 1, 20, diskonto))} />
                    </div>
                  </div>

                  {/* Tarif */}
                  <div className="flex flex-col gap-1.5">
                    <div className="flex justify-between items-center">
                      <label className="text-xs font-medium text-slate-500 dark:text-text-secondary uppercase tracking-wide">Harga Jual Listrik</label>
                      <span className="text-[10px] font-bold text-green-500 bg-green-500/10 px-1.5 py-0.5 rounded">USD/MWh</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <input className="flex-1" max="200" min="20" step="5" type="range" value={tarif} onChange={(e) => setTarif(clampNumber(Number(e.target.value), 20, 200, tarif))} />
                      <input className="w-16 bg-gray-50 dark:bg-[#111a22] border border-gray-200 dark:border-border-dark rounded px-2 py-1.5 text-right text-sm font-medium text-slate-900 dark:text-white focus:outline-none focus:border-primary" step="5" type="number" min="20" max="200" value={tarif} onChange={(e) => setTarif(clampNumber(Number(e.target.value), 20, 200, tarif))} />
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
                    <p>NPV = &Sigma;(Pendapatan &minus; OPEX) / (1+r)<sup>t</sup> &minus; CAPEX</p>
                  </>
                ) : (
                  <>
                    <p>AEP = MWp &times; GHI &times; 365 &times; PR</p>
                    <p>LCOE = (CAPEX + &Sigma;OPEX) / &Sigma;AEP (diskonto)</p>
                    <p>NPV = &Sigma;(Pendapatan &minus; OPEX) / (1+r)<sup>t</sup> &minus; CAPEX</p>
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
                  {aepBasisText}
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
                  <h4 className="text-2xl font-bold text-slate-900 dark:text-white">{kpis.payback !== null ? kpis.payback.toFixed(1) : `>${umurProyek}`}</h4>
                  <span className="text-xs font-bold text-slate-400">Tahun</span>
                </div>
                <p className="text-[10px] text-slate-400 mt-1">{kpis.payback !== null ? `ROI total: ${kpis.roi.toFixed(1)}%` : `Belum balik modal; ROI total ${kpis.roi.toFixed(1)}%`}</p>
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
                    {kpis.payback !== null && kpis.payback < umurProyek && (
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
