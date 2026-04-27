'use client';

import { Suspense, useState, useMemo, useRef, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ScatterChart, Scatter, ReferenceLine,
} from 'recharts';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import { useStations } from '@/hooks/useStations';
import { useMeasurements } from '@/hooks/useMeasurements';

const statusLabel: Record<string, string> = {
  prioritas: 'Prioritas',
  kandidat: 'Kandidat',
  tidak_sesuai: 'Tidak Sesuai',
};

const statusBg: Record<string, string> = {
  prioritas: 'bg-green-500/10 border-green-500/30 text-green-400',
  kandidat: 'bg-amber-500/10 border-amber-500/30 text-amber-300',
  tidak_sesuai: 'bg-slate-500/10 border-slate-500/30 text-slate-400',
};

const mcpLabel: Record<string, string> = {
  selesai: 'Selesai',
  berjalan: 'Berjalan',
  pending: 'Pending',
};

const mcpBadge: Record<string, string> = {
  selesai: 'bg-primary/10 border-primary/30 text-primary',
  berjalan: 'bg-yellow-500/10 border-yellow-500/30 text-yellow-400',
  pending: 'bg-slate-500/10 border-slate-500/30 text-slate-400',
};

function LaporanContent() {
  const { stations } = useStations();
  const searchParams = useSearchParams();
  const router = useRouter();
  const stationId = searchParams.get('station') ?? stations[0].id;
  const station = stations.find((s) => s.id === stationId) ?? stations[0];

  const fromPage = searchParams.get('from') ?? 'peta';
  const backHref = fromPage === 'analisis' ? '/analisis' : fromPage === 'kalkulator' ? '/kalkulator' : '/peta';
  const backLabel = fromPage === 'analisis' ? 'Kembali ke Analisis Lokasi' : fromPage === 'kalkulator' ? 'Kembali ke Kalkulator' : 'Kembali ke Peta';

  const { measurements } = useMeasurements(stationId);
              
  // Gunakan data angin jika stasiun memiliki variabel angin, surya jika tidak
  const hasWind = station.variables.toLowerCase().includes('angin');
  const hasSolar = station.variables.toLowerCase().includes('iradiasi')
    || station.variables.toLowerCase().includes('surya')
    || station.variables.toLowerCase().includes('ghi');
  // keep chartIsWind for legacy refs
  const chartIsWind = hasWind;
  const windBaselineVal = station.windBaseline ?? station.windSpeed * 1.046;
  const ghiBaselineVal = station.ghiBaseline ?? station.irradiation * 0.958;
  // keep for compatibility with existing scatter plot refs
  const atlasBaselineValue = chartIsWind ? windBaselineVal : ghiBaselineVal;

  function makeMonthly(
    meas: typeof measurements,
    getValue: (m: (typeof measurements)[number]) => number,
    baseline: number,
  ) {
    const groups = new Map<string, number[]>();
    meas.forEach((m) => {
      const key = new Date(m.measured_at).toLocaleDateString('id-ID', { month: 'short', year: '2-digit' });
      if (!groups.has(key)) groups.set(key, []);
      const v = getValue(m);
      if (v > 0) groups.get(key)!.push(v);
    });
    return [...groups.entries()]
      .filter(([, vs]) => vs.length > 0)
      .map(([date, vs]) => ({
        date,
        obs: parseFloat((vs.reduce((a, b) => a + b, 0) / vs.length).toFixed(2)),
        baseline,
      }));
  }

  const windChartData = useMemo(
    () => makeMonthly(measurements, (m) => parseFloat((m.wind_speed ?? 0).toString()), windBaselineVal),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [measurements, windBaselineVal],
  );
  const ghiChartData = useMemo(
    () => makeMonthly(measurements, (m) => parseFloat(((m.ghi ?? 0) * 24 / 1000).toFixed(2)), ghiBaselineVal),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [measurements, ghiBaselineVal],
  );
  const windScatterData = useMemo(
    () => measurements.map((m) => ({ obs: parseFloat((m.wind_speed ?? 0).toString()), baseline: windBaselineVal })).filter((p) => p.obs > 0),
    [measurements, windBaselineVal],
  );
  const ghiScatterData = useMemo(
    () => measurements.map((m) => ({ obs: parseFloat(((m.ghi ?? 0) * 24 / 1000).toFixed(2)), baseline: ghiBaselineVal })).filter((p) => p.obs > 0),
    [measurements, ghiBaselineVal],
  );

  // keep legacy aliases used by existing Recharts preview
  const chartData = chartIsWind ? windChartData : ghiChartData;
  const scatterData = chartIsWind ? windScatterData : ghiScatterData;

  const chartTsRef = useRef<HTMLDivElement>(null);
  const chartScatterRef = useRef<HTMLDivElement>(null);
  const chartTsGhiRef = useRef<HTMLDivElement>(null);
  const chartScatterGhiRef = useRef<HTMLDivElement>(null);

  const [exporting, setExporting] = useState<'pdf' | 'csv' | 'geojson' | null>(null);

  const [isDark, setIsDark] = useState(true);
  useEffect(() => {
    setIsDark(localStorage.getItem('re_valid_theme') !== 'light');
  }, []);
  const gridColor = isDark ? '#2d3b4a' : '#e2e8f0';
  const tooltipBg = isDark ? '#1c2630' : '#ffffff';
  const tooltipBorder = isDark ? '#2d3b4a' : '#e2e8f0';
  const tooltipLabel = isDark ? '#92adc9' : '#374151';

  const mcdaFactors = [
    { label: 'Potensi EBT', pct: Math.min(100, station.score + 5) },
    { label: 'Topografi', pct: station.altitude > 500 ? 80 : 55 },
    { label: 'Aksesibilitas', pct: station.altitude > 1000 ? 55 : 75 },
    { label: 'Infrastruktur', pct: Math.max(30, station.score - 15) },
  ];

  async function handleExportPDF() {
    setExporting('pdf');
    try {
      const { default: jsPDF } = await import('jspdf');
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const W = pdf.internal.pageSize.getWidth();
      let y = 18;

      // Header bar
      pdf.setFillColor(19, 127, 236);
      pdf.rect(0, 0, W, 14, 'F');
      pdf.setTextColor(255, 255, 255);
      pdf.setFontSize(11);
      pdf.setFont('helvetica', 'bold');
      pdf.text('RE-Valid — Laporan Validasi Potensi EBT', 10, 9.5);
      pdf.setFontSize(8);
      pdf.setFont('helvetica', 'normal');
      pdf.text(`Diekspor: ${new Date().toLocaleString('id-ID')}`, W - 10, 9.5, { align: 'right' });

      // Station title
      pdf.setTextColor(30, 30, 30);
      pdf.setFontSize(15);
      pdf.setFont('helvetica', 'bold');
      pdf.text(station.name, 10, y);
      y += 6;
      pdf.setFontSize(9);
      pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(100, 100, 100);
      pdf.text(`${station.region}  ·  ID: ${station.id}  ·  Status: ${statusLabel[station.status]}  ·  MCP: ${mcpLabel[station.mcpStatus]}`, 10, y);
      y += 8;

      // Section helper
      const sectionTitle = (title: string) => {
        pdf.setFillColor(235, 240, 250);
        pdf.rect(10, y, W - 20, 7, 'F');
        pdf.setFontSize(9);
        pdf.setFont('helvetica', 'bold');
        pdf.setTextColor(19, 127, 236);
        pdf.text(title, 12, y + 5);
        y += 10;
      };
      const row = (label: string, value: string, highlight?: boolean) => {
        pdf.setFontSize(9);
        pdf.setFont('helvetica', 'normal');
        pdf.setTextColor(80, 80, 80);
        pdf.text(label, 14, y);
        pdf.setFont('helvetica', 'bold');
        pdf.setTextColor(highlight ? 22 : 30, highlight ? 163 : 30, highlight ? 74 : 30);
        pdf.text(value, W - 14, y, { align: 'right' });
        y += 5.5;
      };

      // Identitas Stasiun
      sectionTitle('Identitas Stasiun');
      row('Koordinat', `${station.lat.toFixed(4)}, ${station.lon.toFixed(4)}`);
      row('Ketinggian', `${station.altitude.toLocaleString('id')} m dpl`);
      row('Periode', station.period);
      row('Variabel', station.variables);
      y += 3;

      // Metrik Validasi Angin
      sectionTitle('Metrik Validasi Angin (ERA5 vs Observasi)');
      row('Kecepatan Angin Rata-rata', `${station.windSpeed} m/s`);
      row('RMSE', `${station.rmse.toFixed(2)} m/s`);
      row('Bias', `${station.bias > 0 ? '+' : ''}${station.bias.toFixed(1)} %`);
      row('R²', station.r2.toFixed(2));
      row('Skor GIS-MCDA', `${station.score} / 100`);
      y += 3;

      // Validasi Surya
      sectionTitle('Validasi Surya — GHI (GSA vs Observasi)');
      row('GHI Observasi', `${station.irradiation.toFixed(1)} kWh/m²/hari`);
      row('GHI Baseline GSA (Solargis)', station.ghiBaselineGsa != null ? `${station.ghiBaselineGsa.toFixed(2)} kWh/m²/hari` : '—');
      row('GHI Baseline NASA POWER', station.ghiBaselineNasa != null ? `${station.ghiBaselineNasa.toFixed(2)} kWh/m²/hari` : '—');
      row('GHI Best-Value', `${(station.ghiBaseline ?? station.irradiation * 0.958).toFixed(2)} kWh/m²/hari`);
      row('Clearness Index (Kt)', (station.irradiation / 8.5).toFixed(2));
      y += 3;

      // Perbandingan Sumber Angin
      sectionTitle('Perbandingan Sumber Baseline Angin');
      row('Obs Lapangan', `${station.windSpeed} m/s`);
      row('GWA 3.0 (GeoTIFF 250m)', station.windBaselineGwa != null ? `${station.windBaselineGwa} m/s` : '— (belum tersedia)');
      row('NASA POWER ERA5', station.windBaselineNasa != null ? `${station.windBaselineNasa} m/s` : '— (belum tersedia)');
      row('Best-Value (dipakai MCP)', `${(station.windBaseline ?? station.windSpeed).toFixed(2)} m/s`);
      y += 3;

      // Potensi Energi
      sectionTitle('Potensi Energi');
      row('Kecepatan Angin Rata-rata (GWA)', `${station.windSpeed} m/s`);
      row('Iradiasi Matahari GHI (GSA)', `${station.irradiation} kWh/m²/hari`);
      row('AEP PLTB P50', `${station.aep.toLocaleString('id')} MWh/thn`);
      row('Hasil Spesifik PLTS (PR=75%)', `${Math.round(station.irradiation * 365 * 0.75).toLocaleString('id')} kWh/kWp·thn`);
      y += 3;

      // GIS-MCDA
      sectionTitle('Faktor Kesesuaian GIS-MCDA');
      mcdaFactors.forEach((f) => row(f.label, `${f.pct}%`));
      y += 3;

      // Footer page 1
      pdf.setFontSize(7);
      pdf.setFont('helvetica', 'italic');
      pdf.setTextColor(160, 160, 160);
      pdf.text('Sumber referensi: ERA5 (ECMWF) · GWA 3.0 · GSA/SOLARGIS · RE-Valid DSS', 10, y);
      y += 4;
      pdf.text(`Periode: ${station.period}  ·  Referensi MCP: ERA5 (ECMWF)  ·  Atlas baseline: GWA/GSA`, 10, y);

      // ── Page 2: Grafik Visualisasi & Korelasi ─────────────────────────────
      pdf.addPage();
      y = 18;
      pdf.setFillColor(19, 127, 236);
      pdf.rect(0, 0, W, 14, 'F');
      pdf.setTextColor(255, 255, 255);
      pdf.setFontSize(11);
      pdf.setFont('helvetica', 'bold');
      pdf.text('RE-Valid — Grafik Validasi', 10, 9.5);
      pdf.setFontSize(8);
      pdf.setFont('helvetica', 'normal');
      pdf.text(`${station.name} (${station.id})`, W - 10, 9.5, { align: 'right' });

      // ── Helpers: build chart data ─────────────────────────────────────────
      function buildMonthly(
        meas: typeof measurements,
        getValue: (m: (typeof measurements)[number]) => number,
        baseline: number,
      ): { date: string; obs: number; baseline: number }[] {
        const groups = new Map<string, number[]>();
        meas.forEach((m) => {
          const key = new Date(m.measured_at).toLocaleDateString('id-ID', { month: 'short', year: '2-digit' });
          if (!groups.has(key)) groups.set(key, []);
          const v = getValue(m);
          if (v > 0) groups.get(key)!.push(v);
        });
        return [...groups.entries()]
          .filter(([, vs]) => vs.length > 0)
          .map(([date, vs]) => ({
            date,
            obs: parseFloat((vs.reduce((a, b) => a + b, 0) / vs.length).toFixed(2)),
            baseline,
          }));
      }

      function buildScatter(
        meas: typeof measurements,
        getValue: (m: (typeof measurements)[number]) => number,
        baseline: number,
      ): { obs: number; baseline: number }[] {
        return meas.map((m) => ({ obs: getValue(m), baseline })).filter((p) => p.obs > 0);
      }

      // ── Helpers: draw charts onto offscreen canvas ────────────────────────
      function drawLineChart(
        data: { date: string; obs: number; baseline: number }[],
        obsColor: string,
        obsLabel: string,
        unit: string,
      ): HTMLCanvasElement {
        const CW = 1100, CH = 340;
        const cvs = document.createElement('canvas');
        cvs.width = CW; cvs.height = CH;
        const c = cvs.getContext('2d')!;
        const ML = 65, MR = 55, MT = 24, MB = 52;
        const PW = CW - ML - MR, PH = CH - MT - MB;
        c.fillStyle = '#f8fafc'; c.fillRect(0, 0, CW, CH);
        c.strokeStyle = '#e2e8f0'; c.lineWidth = 1; c.strokeRect(0.5, 0.5, CW - 1, CH - 1);
        if (data.length === 0) {
          c.fillStyle = '#94a3b8'; c.font = '22px sans-serif'; c.textAlign = 'center';
          c.fillText('Belum ada data pengukuran', CW / 2, CH / 2);
          return cvs;
        }
        const vals = data.flatMap((d) => [d.obs, d.baseline]).filter(isFinite);
        const minV = Math.min(...vals), maxV = Math.max(...vals);
        const pad = (maxV - minV || 1) * 0.15;
        const lo = minV - pad, hi = maxV + pad;
        const xS = (i: number) => ML + (data.length < 2 ? PW / 2 : (i / (data.length - 1)) * PW);
        const yS = (v: number) => MT + PH - ((v - lo) / (hi - lo)) * PH;
        for (let i = 0; i <= 5; i++) {
          const yp = MT + (i / 5) * PH;
          c.strokeStyle = '#e2e8f0'; c.lineWidth = 1;
          c.beginPath(); c.moveTo(ML, yp); c.lineTo(ML + PW, yp); c.stroke();
          c.fillStyle = '#94a3b8'; c.font = '17px sans-serif'; c.textAlign = 'right';
          c.fillText((hi - (i / 5) * (hi - lo)).toFixed(1), ML - 7, yp + 6);
        }
        const step = data.length <= 12 ? 1 : Math.ceil(data.length / 12);
        c.fillStyle = '#94a3b8'; c.font = '16px sans-serif'; c.textAlign = 'center';
        data.forEach((d, i) => { if (i % step === 0) c.fillText(d.date, xS(i), MT + PH + 30); });
        c.strokeStyle = '#94a3b8'; c.lineWidth = 2; c.setLineDash([7, 4]);
        c.beginPath();
        data.forEach((d, i) => { i === 0 ? c.moveTo(xS(i), yS(d.baseline)) : c.lineTo(xS(i), yS(d.baseline)); });
        c.stroke(); c.setLineDash([]);
        c.strokeStyle = obsColor; c.lineWidth = 2.5;
        c.beginPath();
        data.forEach((d, i) => { i === 0 ? c.moveTo(xS(i), yS(d.obs)) : c.lineTo(xS(i), yS(d.obs)); });
        c.stroke();
        c.fillStyle = obsColor;
        data.forEach((d, i) => { c.beginPath(); c.arc(xS(i), yS(d.obs), 4, 0, Math.PI * 2); c.fill(); });
        c.strokeStyle = '#cbd5e1'; c.lineWidth = 1; c.setLineDash([]);
        c.beginPath(); c.moveTo(ML, MT); c.lineTo(ML, MT + PH); c.lineTo(ML + PW, MT + PH); c.stroke();
        const lx = ML + PW - 230, ly = MT + 10;
        c.strokeStyle = obsColor; c.lineWidth = 2.5; c.setLineDash([]);
        c.beginPath(); c.moveTo(lx, ly); c.lineTo(lx + 25, ly); c.stroke();
        c.fillStyle = '#374151'; c.font = '16px sans-serif'; c.textAlign = 'left';
        c.fillText(obsLabel, lx + 30, ly + 5);
        c.strokeStyle = '#94a3b8'; c.lineWidth = 2; c.setLineDash([7, 4]);
        c.beginPath(); c.moveTo(lx, ly + 22); c.lineTo(lx + 25, ly + 22); c.stroke();
        c.setLineDash([]); c.fillStyle = '#374151'; c.fillText('Baseline Atlas', lx + 30, ly + 27);
        c.save(); c.translate(14, MT + PH / 2); c.rotate(-Math.PI / 2);
        c.fillStyle = '#94a3b8'; c.font = '15px sans-serif'; c.textAlign = 'center';
        c.fillText(unit, 0, 0); c.restore();
        return cvs;
      }

      function drawScatterChart(
        data: { obs: number; baseline: number }[],
        pointColor: string,
        unit: string,
        refLine: number,
      ): HTMLCanvasElement {
        const CW = 1100, CH = 300;
        const cvs = document.createElement('canvas');
        cvs.width = CW; cvs.height = CH;
        const c = cvs.getContext('2d')!;
        const ML = 65, MR = 55, MT = 20, MB = 55;
        const PW = CW - ML - MR, PH = CH - MT - MB;
        c.fillStyle = '#f8fafc'; c.fillRect(0, 0, CW, CH);
        c.strokeStyle = '#e2e8f0'; c.lineWidth = 1; c.strokeRect(0.5, 0.5, CW - 1, CH - 1);
        if (data.length === 0) {
          c.fillStyle = '#94a3b8'; c.font = '22px sans-serif'; c.textAlign = 'center';
          c.fillText('Belum ada data', CW / 2, CH / 2); return cvs;
        }
        const xVals = data.map((d) => d.baseline), yVals = data.map((d) => d.obs);
        const xPad = (Math.max(...xVals) - Math.min(...xVals) || 1) * 0.2;
        const yPad = (Math.max(...yVals) - Math.min(...yVals) || 1) * 0.2;
        const xl = Math.min(...xVals) - xPad, xh = Math.max(...xVals) + xPad;
        const yl = Math.min(...yVals) - yPad, yh = Math.max(...yVals) + yPad;
        const xS = (v: number) => ML + ((v - xl) / (xh - xl)) * PW;
        const yS = (v: number) => MT + PH - ((v - yl) / (yh - yl)) * PH;
        for (let i = 0; i <= 5; i++) {
          const yp = MT + (i / 5) * PH, xp = ML + (i / 5) * PW;
          c.strokeStyle = '#e2e8f0'; c.lineWidth = 1;
          c.beginPath(); c.moveTo(ML, yp); c.lineTo(ML + PW, yp); c.stroke();
          c.beginPath(); c.moveTo(xp, MT); c.lineTo(xp, MT + PH); c.stroke();
          c.fillStyle = '#94a3b8'; c.font = '16px sans-serif';
          c.textAlign = 'right'; c.fillText((yh - (i / 5) * (yh - yl)).toFixed(1), ML - 7, yp + 5);
          c.textAlign = 'center'; c.fillText((xl + (i / 5) * (xh - xl)).toFixed(1), xp, MT + PH + 22);
        }
        if (refLine >= yl && refLine <= yh) {
          c.strokeStyle = '#94a3b8'; c.lineWidth = 1.5; c.setLineDash([6, 3]);
          c.beginPath(); c.moveTo(ML, yS(refLine)); c.lineTo(ML + PW, yS(refLine)); c.stroke();
          c.setLineDash([]); c.fillStyle = '#94a3b8'; c.font = '15px sans-serif'; c.textAlign = 'left';
          c.fillText('baseline', ML + 6, yS(refLine) - 5);
        }
        c.fillStyle = pointColor + 'bb';
        data.forEach((d) => { c.beginPath(); c.arc(xS(d.baseline), yS(d.obs), 5, 0, Math.PI * 2); c.fill(); });
        c.strokeStyle = '#cbd5e1'; c.lineWidth = 1; c.setLineDash([]);
        c.beginPath(); c.moveTo(ML, MT); c.lineTo(ML, MT + PH); c.lineTo(ML + PW, MT + PH); c.stroke();
        c.fillStyle = '#6b7280'; c.font = '17px sans-serif'; c.textAlign = 'center';
        c.fillText(`Baseline Atlas (${unit})`, ML + PW / 2, CH - 5);
        c.save(); c.translate(16, MT + PH / 2); c.rotate(-Math.PI / 2);
        c.fillText(`Observasi (${unit})`, 0, 0); c.restore();
        // info jumlah data
        c.fillStyle = '#94a3b8'; c.font = '15px sans-serif'; c.textAlign = 'right';
        c.fillText(`n = ${data.length} titik data`, ML + PW - 4, MT + 18);
        return cvs;
      }

      // ── Section renderer: title + line chart + scatter ────────────────────
      function addChartSection(
        title: string,
        subtitle: string,
        lineCanv: HTMLCanvasElement,
        scatCanv: HTMLCanvasElement,
      ) {
        const lH = Math.round((W - 20) * lineCanv.height / lineCanv.width);
        const sH = Math.round((W - 20) * scatCanv.height / scatCanv.width);
        if (y + 10 + lH + 14 + sH + 8 > 286) { pdf.addPage(); y = 18; }
        pdf.setFontSize(10); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(30, 30, 30);
        pdf.text(title, 10, y); y += 5;
        pdf.setFontSize(8); pdf.setFont('helvetica', 'normal'); pdf.setTextColor(100, 100, 100);
        pdf.text(subtitle, 10, y); y += 5;
        pdf.addImage(lineCanv.toDataURL('image/png'), 'PNG', 10, y, W - 20, lH);
        y += lH + 4;
        pdf.setFontSize(8); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(60, 60, 60);
        pdf.text('Analisis Korelasi (Distribusi Observasi vs Baseline)', 10, y); y += 4;
        pdf.addImage(scatCanv.toDataURL('image/png'), 'PNG', 10, y, W - 20, sH);
        y += sH + 8;
      }

      // ── Draw wind + solar charts ──────────────────────────────────────────
      const hasWind = station.variables.toLowerCase().includes('angin');
      const hasSolar = station.variables.toLowerCase().includes('iradiasi')
        || station.variables.toLowerCase().includes('surya')
        || station.variables.toLowerCase().includes('ghi');
      const windBaseline = station.windBaseline ?? station.windSpeed * 1.046;
      const solarBaseline = station.ghiBaseline ?? station.irradiation * 0.958;

      if (!hasWind && !hasSolar) {
        pdf.setFontSize(9); pdf.setFont('helvetica', 'italic'); pdf.setTextColor(150, 150, 150);
        pdf.text('Tidak ada data grafik tersedia untuk stasiun ini.', W / 2, 150, { align: 'center' });
      } else {
        if (hasWind) {
          const wMon = buildMonthly(measurements, (m) => parseFloat((m.wind_speed ?? 0).toString()), windBaseline);
          const wSca = buildScatter(measurements, (m) => parseFloat((m.wind_speed ?? 0).toString()), windBaseline);
          addChartSection(
            'Kecepatan Angin — Baseline Atlas vs Observasi',
            `GWA/ERA5 Baseline: ${windBaseline.toFixed(2)} m/s  ·  RMSE: ${station.rmse.toFixed(2)} m/s  ·  Bias: ${station.bias > 0 ? '+' : ''}${station.bias.toFixed(1)}%  ·  R²: ${station.r2.toFixed(2)}`,
            drawLineChart(wMon, '#137fec', 'Terukur (Obs)', 'm/s'),
            drawScatterChart(wSca, '#137fec', 'm/s', windBaseline),
          );
        }
        if (hasSolar) {
          const sMon = buildMonthly(measurements, (m) => parseFloat(((m.ghi ?? 0) * 24 / 1000).toFixed(2)), solarBaseline);
          const sSca = buildScatter(measurements, (m) => parseFloat(((m.ghi ?? 0) * 24 / 1000).toFixed(2)), solarBaseline);
          addChartSection(
            'Iradiasi Matahari (GHI) — Baseline Atlas vs Observasi',
            `GSA/NASA Baseline: ${solarBaseline.toFixed(2)} kWh/m²/hari  ·  Clearness Index Kt: ${(station.irradiation / 8.5).toFixed(2)}`,
            drawLineChart(sMon, '#f59e0b', 'GHI Terukur (Obs)', 'kWh/m²/hari'),
            drawScatterChart(sSca, '#f59e0b', 'kWh/m²/hari', solarBaseline),
          );
        }
      }

      pdf.setFontSize(7); pdf.setFont('helvetica', 'italic'); pdf.setTextColor(160, 160, 160);
      pdf.text('RE-Valid DSS — Grafik Validasi  ·  ERA5/GWA/GSA', W / 2, y, { align: 'center' });

      pdf.save(`RE-Valid_Laporan_${station.id}_${new Date().toISOString().slice(0, 10)}.pdf`);
    } finally {
      setExporting(null);
    }
  }

  function handleExportCSV() {
    setExporting('csv');
    const rows = [
      ['Field', 'Value'],
      ['Station ID', station.id],
      ['Nama', station.name],
      ['Wilayah', station.region],
      ['Latitude', station.lat],
      ['Longitude', station.lon],
      ['Ketinggian (m)', station.altitude],
      ['Status', station.status],
      ['Periode', station.period],
      ['Variabel', station.variables],
      [],
      ['--- Metrik Validasi Angin ---', ''],
      ['Kecepatan Angin Rata-rata (m/s)', station.windSpeed],
      ['RMSE (m/s)', station.rmse],
      ['Bias (%)', station.bias],
      ['R²', station.r2],
      ['Skor GIS-MCDA (/100)', station.score],
      [],
      ['--- Validasi Surya ---'],
      ['GHI Observasi (kWh/m²/hari)', station.irradiation],
      ['GHI Baseline GSA/Solargis (kWh/m²/hari)', station.ghiBaselineGsa?.toFixed(2) ?? '—'],
      ['GHI Baseline NASA POWER (kWh/m²/hari)', station.ghiBaselineNasa?.toFixed(2) ?? '—'],
      ['GHI Best-Value (kWh/m²/hari)', (station.ghiBaseline ?? station.irradiation * 0.958).toFixed(2)],
      ['Clearness Index (Kt)', (station.irradiation / 8.5).toFixed(2)],
      [],
      ['--- Baseline Angin ---'],
      ['Angin Obs Lapangan (m/s)', station.windSpeed],
      ['Angin Baseline GWA 3.0 (m/s)', station.windBaselineGwa?.toString() ?? '—'],
      ['Angin Baseline NASA POWER (m/s)', station.windBaselineNasa?.toString() ?? '—'],
      ['Angin Best-Value (m/s)', (station.windBaseline ?? station.windSpeed).toFixed(2)],
      [],
      ['--- Potensi Energi ---'],
      ['AEP PLTB P50 (MWh/thn)', station.aep],
      ['Hasil Spesifik PLTS (kWh/kWp·thn)', Math.round(station.irradiation * 365 * 0.75)],
      [],
      ['--- Faktor GIS-MCDA ---'],
      ...mcdaFactors.map((f) => [f.label, `${f.pct}%`]),
      [],
      ['Diekspor pada', new Date().toLocaleString('id-ID')],
      ['Sumber', 'RE-Valid DSS — ERA5/GWA/GSA'],
    ];
    const csv = rows.map((r) => r.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `RE-Valid_Data_${station.id}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setExporting(null);
  }

  function handleExportGeoJSON() {
    setExporting('geojson');
    const geojson = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [station.lon, station.lat] },
          properties: {
            id: station.id,
            name: station.name,
            region: station.region,
            altitude_m: station.altitude,
            status: station.status,
            score: station.score,
            wind_speed_ms: station.windSpeed,
            wind_baseline_gwa_ms: station.windBaselineGwa ?? null,
            wind_baseline_nasa_ms: station.windBaselineNasa ?? null,
            wind_baseline_best_ms: station.windBaseline ?? null,
            ghi_kwh_m2_day: station.irradiation,
            ghi_baseline_gsa_kwh: station.ghiBaselineGsa ?? null,
            ghi_baseline_nasa_kwh: station.ghiBaselineNasa ?? null,
            ghi_baseline_best_kwh: station.ghiBaseline ?? null,
            aep_mwh_yr: station.aep,
            rmse: station.rmse,
            bias_pct: station.bias,
            r2: station.r2,
            period: station.period,
            exported_at: new Date().toISOString(),
            source: 'RE-Valid DSS',
          },
        },
      ],
    };
    const blob = new Blob([JSON.stringify(geojson, null, 2)], { type: 'application/geo+json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `RE-Valid_GeoJSON_${station.id}_${new Date().toISOString().slice(0, 10)}.geojson`;
    a.click();
    URL.revokeObjectURL(url);
    setExporting(null);
  }

  return (
    <div className="bg-background-light dark:bg-background-dark font-display text-slate-900 dark:text-white min-h-screen flex flex-col text-sm">
      <Navbar />

      <main className="flex-1 flex flex-col w-full max-w-360 mx-auto px-4 lg:px-8 py-4">
        {/* Header */}
        <div className="flex flex-col gap-3 mb-5 pt-2">
          <div className="flex flex-wrap justify-between items-end gap-3">
            <div className="flex flex-col gap-1.5 max-w-2xl">
              <Link
                href={backHref}
                className="flex items-center gap-1 text-xs font-semibold text-primary mb-0.5 hover:underline"
              >
                <span className="material-symbols-outlined text-[14px]">arrow_back</span>
                {backLabel}
              </Link>
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-xl font-bold leading-tight text-slate-900 dark:text-white">
                  Laporan Lengkap
                </h1>
                <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${statusBg[station.status]}`}>
                  {statusLabel[station.status]}
                </span>
              </div>
              <p className="text-slate-600 dark:text-text-secondary text-sm font-normal leading-relaxed">
                {station.name} &middot; {station.region} &middot; Skor {station.score}/100
              </p>
            </div>
          </div>
        </div>

        {/* ── Control bar ───────────────────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row gap-3 mb-2">
          <div className="flex-1 bg-white dark:bg-card-dark rounded-xl border border-gray-200 dark:border-border-dark px-4 py-3 flex items-center gap-3 shadow-sm">
            <span className="material-symbols-outlined text-primary text-[18px] shrink-0">location_on</span>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-bold text-slate-500 dark:text-text-secondary uppercase tracking-wide mb-1">Pilih Stasiun</p>
              <div className="relative">
                <select
                  value={station.id}
                  onChange={(e) => router.push(`/laporan?station=${e.target.value}${fromPage !== 'peta' ? `&from=${fromPage}` : ''}`)}
                  className="w-full bg-gray-50 dark:bg-[#111a22] border border-gray-200 dark:border-border-dark rounded-lg py-1.5 pl-3 pr-8 text-sm text-slate-900 dark:text-white focus:ring-1 focus:ring-primary focus:border-primary outline-none transition-all appearance-none"
                >
                  {stations.map((s) => (
                    <option key={s.id} value={s.id}>{s.name} ({s.id})</option>
                  ))}
                </select>
                <span className="absolute right-2.5 top-2 text-slate-400 material-symbols-outlined text-[16px] pointer-events-none">expand_more</span>
              </div>
            </div>
          </div>
          <div className="flex-1 bg-blue-50 dark:bg-blue-900/20 rounded-xl px-4 py-3 border border-blue-100 dark:border-blue-800/30 flex items-center gap-3">
            <span className="material-symbols-outlined text-primary text-[18px] shrink-0">info</span>
            <p className="text-xs text-slate-600 dark:text-blue-100/70 leading-relaxed">
              <span className="font-bold text-slate-900 dark:text-white">Catatan: </span>
              Referensi MCP: ERA5 (ECMWF) · Atlas: GWA/GSA · Periode: {station.period}
            </p>
          </div>
        </div>

        {/* ── Main content — full width ──────────────────────────────────────── */}
        <div className="flex flex-col gap-5">
          {/* Station identity full-width */}
          <div className="bg-white dark:bg-card-dark border border-gray-200 dark:border-border-dark rounded-xl p-5 shadow-sm">
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className={`w-2.5 h-2.5 rounded-full ${
                        station.status === 'prioritas'
                          ? 'bg-green-500 animate-pulse'
                          : station.status === 'kandidat'
                          ? 'bg-amber-400'
                          : 'bg-slate-400'
                      }`}
                    />
                    <span className="text-xs font-mono text-slate-400">{station.id}</span>
                    <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${statusBg[station.status]}`}>
                      {statusLabel[station.status]}
                    </span>
                  </div>
                  <h2 className="text-lg font-bold text-slate-900 dark:text-white">{station.name}</h2>
                  <p className="text-sm text-slate-500 dark:text-text-secondary">{station.region}</p>
                </div>
                <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full border ${mcpBadge[station.mcpStatus]} shrink-0`}>
                  MCP: {mcpLabel[station.mcpStatus]}
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                {[
                  { label: 'Koordinat', value: `${station.lat.toFixed(4)}, ${station.lon.toFixed(4)}` },
                  { label: 'Ketinggian', value: `${station.altitude.toLocaleString('id')} m dpl` },
                  { label: 'Periode', value: station.period },
                  { label: 'Variabel', value: station.variables },
                ].map((item) => (
                  <div
                    key={item.label}
                    className="bg-slate-50 dark:bg-[#111a22] rounded-lg p-3 border border-slate-100 dark:border-[#233648]"
                  >
                    <p className="text-[10px] text-slate-400 uppercase tracking-wide mb-1">{item.label}</p>
                    <p className="text-[12px] font-semibold text-slate-800 dark:text-slate-200 leading-tight">
                      {item.value}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* Validation metrics */}

          {/* Row 2: metrik angin + validasi surya — 2 kolom sejajar */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="bg-white dark:bg-card-dark border border-gray-200 dark:border-border-dark rounded-xl p-5 shadow-sm">
              <div className="flex items-center gap-2 mb-4">
                <span className="material-symbols-outlined text-violet-400 text-[20px]">query_stats</span>
                <h4 className="text-sm font-bold text-slate-900 dark:text-white">Metrik Validasi</h4>
                <span className="ml-auto text-[11px] text-slate-400">Angin — ERA5 vs Observasi Lapangan</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: 'RMSE', value: station.rmse.toFixed(2), unit: 'm/s', color: 'text-blue-400' },
                  {
                    label: 'Bias',
                    value: `${station.bias > 0 ? '+' : ''}${station.bias.toFixed(1)}`,
                    unit: '%',
                    color: station.bias > 0 ? 'text-amber-400' : 'text-green-400',
                  },
                  { label: 'R²', value: station.r2.toFixed(2), unit: '', color: 'text-primary' },
                  {
                    label: 'Skor',
                    value: `${station.score}`,
                    unit: '/100',
                    color: station.score >= 80 ? 'text-green-400' : 'text-amber-400',
                  },
                ].map((m) => (
                  <div
                    key={m.label}
                    className="bg-slate-50 dark:bg-[#111a22] rounded-xl p-4 border border-slate-100 dark:border-[#233648] text-center"
                  >
                    <p className="text-[10px] text-slate-400 uppercase tracking-wide mb-1">{m.label}</p>
                    <p className={`text-2xl font-bold ${m.color}`}>
                      {m.value}
                      <span className="text-[13px] font-medium text-slate-400 ml-0.5">{m.unit}</span>
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* Solar validation metrics */}
            <div className="bg-white dark:bg-card-dark border border-gray-200 dark:border-border-dark rounded-xl p-5 shadow-sm">
              <div className="flex items-center gap-2 mb-4">
                <span className="material-symbols-outlined text-amber-400 text-[20px]">wb_sunny</span>
                <h4 className="text-sm font-bold text-slate-900 dark:text-white">Validasi Surya (GHI)</h4>
                <span className="ml-auto text-[11px] text-slate-400">GSA vs Observasi Lapangan</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-slate-50 dark:bg-[#111a22] rounded-xl p-4 border border-slate-100 dark:border-[#233648] text-center">
                  <p className="text-[10px] text-slate-400 uppercase tracking-wide mb-1">GHI Observasi</p>
                  <p className="text-2xl font-bold text-amber-400">
                    {station.irradiation.toFixed(1)}
                    <span className="text-[12px] font-medium text-slate-400 ml-0.5">kWh/m²/hari</span>
                  </p>
                </div>
                <div className="bg-slate-50 dark:bg-[#111a22] rounded-xl p-4 border border-slate-100 dark:border-[#233648] text-center">
                  <p className="text-[10px] text-slate-400 uppercase tracking-wide mb-1">GHI Baseline (GSA)</p>
                  <p className="text-2xl font-bold text-slate-400 dark:text-slate-300">
                    {(station.ghiBaseline ?? station.irradiation * 0.958).toFixed(1)}
                    <span className="text-[12px] font-medium text-slate-400 ml-0.5">kWh/m²/hari</span>
                  </p>
                  <p className="text-[10px] text-slate-400 mt-0.5">{station.ghiBaselineGsa != null ? 'GSA Solargis' : station.ghiBaselineNasa != null ? 'NASA POWER' : 'Estimasi'}</p>
                </div>
                <div className="bg-slate-50 dark:bg-[#111a22] rounded-xl p-4 border border-slate-100 dark:border-[#233648] text-center">
                  <p className="text-[10px] text-slate-400 uppercase tracking-wide mb-1">Clearness Index (Kt)</p>
                  <p className={`text-2xl font-bold ${
                    station.irradiation / 8.5 >= 0.40 && station.irradiation / 8.5 <= 0.65
                      ? 'text-green-400'
                      : 'text-red-400'
                  }`}>
                    {(station.irradiation / 8.5).toFixed(2)}
                  </p>
                  <p className="text-[10px] text-slate-400 mt-0.5">Rentang: 0.40–0.65</p>
                </div>
                <div className="bg-slate-50 dark:bg-[#111a22] rounded-xl p-4 border border-slate-100 dark:border-[#233648] text-center">
                  <p className="text-[10px] text-slate-400 uppercase tracking-wide mb-1">Bias vs GSA</p>
                  <p className={`text-2xl font-bold ${
                    Math.abs(station.bias) <= 5 ? 'text-green-400' : 'text-amber-400'
                  }`}>
                    {station.bias > 0 ? '+' : ''}{station.bias.toFixed(1)}
                    <span className="text-[13px] font-medium text-slate-400 ml-0.5">%</span>
                  </p>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <span className="text-[10px] font-mono px-2 py-0.5 rounded border bg-amber-500/10 border-amber-500/30 text-amber-400">SOLARGIS / GSA</span>
                <span className={`text-[10px] font-mono px-2 py-0.5 rounded border ${
                  station.irradiation / 8.5 >= 0.40 && station.irradiation / 8.5 <= 0.65
                    ? 'bg-green-500/10 border-green-500/30 text-green-400'
                    : 'bg-red-500/10 border-red-500/30 text-red-400'
                }`}>
                  {'Kt = '}{(station.irradiation / 8.5).toFixed(2)}{station.irradiation / 8.5 >= 0.40 && station.irradiation / 8.5 <= 0.65 ? ' ✓ Valid' : ' ⚠ Di luar rentang'}
                </span>
              </div>
            </div>
          </div>

          {/* Row 3: Grafik Validasi full-width */}
            {/* Grafik Validasi Preview */}
            <div className="bg-white dark:bg-card-dark border border-gray-200 dark:border-border-dark rounded-xl p-5 shadow-sm">
              <div className="flex items-center gap-2 mb-4">
                <span className="material-symbols-outlined text-primary text-[20px]">ssid_chart</span>
                <h4 className="text-sm font-bold text-slate-900 dark:text-white">Grafik Validasi</h4>
                <span className="ml-auto text-[11px] text-slate-400">
                  {hasWind && hasSolar ? 'Angin & GHI — Obs vs Baseline Atlas' : hasWind ? 'Angin — Obs vs Baseline Atlas' : 'GHI — Obs vs Baseline Atlas'}
                </span>
              </div>

              {/* ── Angin ──────────────────────────────────────────── */}
              {hasWind && (
                <>
                  <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-2 flex items-center gap-1">
                    <span className="material-symbols-outlined text-primary text-[14px]">air</span>
                    Kecepatan Angin (m/s)
                  </p>
                  <div ref={chartTsRef} className="w-full bg-gray-50 dark:bg-[#111a22] rounded-lg overflow-hidden border border-gray-200 dark:border-gray-800 py-3 pr-3 mb-2" style={{ height: 200 }}>
                    {windChartData.length === 0 ? (
                      <div className="flex flex-col items-center justify-center h-full text-sm text-slate-500 gap-2">
                        <span className="material-symbols-outlined text-[28px]">ssid_chart</span><span>Belum ada data angin</span>
                      </div>
                    ) : (
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={windChartData} margin={{ top: 10, right: 15, bottom: 5, left: 10 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
                          <XAxis dataKey="date" tick={{ fontSize: 9, fill: '#64748b' }} tickLine={false} interval={0} />
                          <YAxis tick={{ fontSize: 9, fill: '#64748b' }} tickLine={false} axisLine={false} />
                          <Tooltip contentStyle={{ backgroundColor: tooltipBg, border: `1px solid ${tooltipBorder}`, borderRadius: '8px', fontSize: 11 }} labelStyle={{ color: tooltipLabel }} />
                          <Line type="monotone" dataKey="obs" name="Terukur (Obs)" stroke="#137fec" dot={{ r: 3 }} strokeWidth={2.5} />
                          <Line type="monotone" dataKey="baseline" name="Baseline Atlas" stroke="#94a3b8" strokeDasharray="5 3" dot={false} strokeWidth={2} />
                        </LineChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                  <div ref={chartScatterRef} className="w-full bg-gray-50 dark:bg-[#111a22] rounded-lg overflow-hidden border border-gray-200 dark:border-gray-800 py-3 pr-3 mb-4" style={{ height: 180 }}>
                    {windScatterData.length === 0 ? (
                      <div className="flex flex-col items-center justify-center h-full text-sm text-slate-500 gap-2">
                        <span className="material-symbols-outlined text-[28px]">scatter_plot</span><span>Belum ada data</span>
                      </div>
                    ) : (
                      <ResponsiveContainer width="100%" height="100%">
                        <ScatterChart margin={{ top: 8, right: 10, bottom: 24, left: 15 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
                          <XAxis dataKey="baseline" name="Baseline" type="number" domain={['auto','auto']} tick={{ fontSize: 9, fill: '#64748b' }} tickLine={false}
                            label={{ value: 'Baseline Atlas (m/s)', position: 'insideBottom', offset: -16, fill: '#64748b', fontSize: 9 }} />
                          <YAxis dataKey="obs" name="Observasi" type="number" domain={['auto','auto']} tick={{ fontSize: 9, fill: '#64748b' }} tickLine={false} axisLine={false}
                            label={{ value: 'Obs (m/s)', angle: -90, position: 'insideLeft', offset: 10, fill: '#64748b', fontSize: 9 }} />
                          <Tooltip contentStyle={{ backgroundColor: tooltipBg, border: `1px solid ${tooltipBorder}`, borderRadius: '8px', fontSize: 11 }} />
                          <Scatter data={windScatterData} fill="#137fec" opacity={0.5} />
                          <ReferenceLine y={windBaselineVal} stroke="#e2e8f0" strokeDasharray="5 3" strokeWidth={1.5}
                            label={{ value: `baseline (${windBaselineVal.toFixed(2)})`, position: 'insideTopLeft', fill: '#94a3b8', fontSize: 9 }} />
                        </ScatterChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                  <p className="text-[10px] text-slate-400 -mt-2 mb-3">
                    n = {windScatterData.length} titik data
                  </p>
                </>
              )}

              {/* ── GHI / Surya ─────────────────────────────────────── */}
              {hasSolar && (
                <>
                  <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-2 flex items-center gap-1">
                    <span className="material-symbols-outlined text-amber-400 text-[14px]">wb_sunny</span>
                    Iradiasi Matahari / GHI (kWh/m²/hari)
                  </p>
                  <div ref={chartTsGhiRef} className="w-full bg-gray-50 dark:bg-[#111a22] rounded-lg overflow-hidden border border-gray-200 dark:border-gray-800 py-3 pr-3 mb-2" style={{ height: 200 }}>
                    {ghiChartData.length === 0 ? (
                      <div className="flex flex-col items-center justify-center h-full text-sm text-slate-500 gap-2">
                        <span className="material-symbols-outlined text-[28px]">wb_sunny</span><span>Belum ada data GHI</span>
                      </div>
                    ) : (
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={ghiChartData} margin={{ top: 10, right: 15, bottom: 5, left: 10 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
                          <XAxis dataKey="date" tick={{ fontSize: 9, fill: '#64748b' }} tickLine={false} interval={0} />
                          <YAxis tick={{ fontSize: 9, fill: '#64748b' }} tickLine={false} axisLine={false} />
                          <Tooltip contentStyle={{ backgroundColor: tooltipBg, border: `1px solid ${tooltipBorder}`, borderRadius: '8px', fontSize: 11 }} labelStyle={{ color: tooltipLabel }} />
                          <Line type="monotone" dataKey="obs" name="GHI Terukur (Obs)" stroke="#f59e0b" dot={{ r: 3 }} strokeWidth={2.5} />
                          <Line type="monotone" dataKey="baseline" name="Baseline Atlas" stroke="#94a3b8" strokeDasharray="5 3" dot={false} strokeWidth={2} />
                        </LineChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                  <div ref={chartScatterGhiRef} className="w-full bg-gray-50 dark:bg-[#111a22] rounded-lg overflow-hidden border border-gray-200 dark:border-gray-800 py-3 pr-3 mb-4" style={{ height: 180 }}>
                    {ghiScatterData.length === 0 ? (
                      <div className="flex flex-col items-center justify-center h-full text-sm text-slate-500 gap-2">
                        <span className="material-symbols-outlined text-[28px]">scatter_plot</span><span>Belum ada data</span>
                      </div>
                    ) : (
                      <ResponsiveContainer width="100%" height="100%">
                        <ScatterChart margin={{ top: 8, right: 10, bottom: 24, left: 15 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
                          <XAxis dataKey="baseline" name="Baseline" type="number" domain={['auto','auto']} tick={{ fontSize: 9, fill: '#64748b' }} tickLine={false}
                            label={{ value: 'Baseline Atlas (kWh/m²/hari)', position: 'insideBottom', offset: -16, fill: '#64748b', fontSize: 9 }} />
                          <YAxis dataKey="obs" name="Observasi" type="number" domain={['auto','auto']} tick={{ fontSize: 9, fill: '#64748b' }} tickLine={false} axisLine={false}
                            label={{ value: 'Obs (kWh)', angle: -90, position: 'insideLeft', offset: 10, fill: '#64748b', fontSize: 9 }} />
                          <Tooltip contentStyle={{ backgroundColor: tooltipBg, border: `1px solid ${tooltipBorder}`, borderRadius: '8px', fontSize: 11 }} />
                          <Scatter data={ghiScatterData} fill="#f59e0b" opacity={0.5} />
                          <ReferenceLine y={ghiBaselineVal} stroke="#e2e8f0" strokeDasharray="5 3" strokeWidth={1.5}
                            label={{ value: `baseline (${ghiBaselineVal.toFixed(2)})`, position: 'insideTopLeft', fill: '#94a3b8', fontSize: 9 }} />
                        </ScatterChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                  <p className="text-[10px] text-slate-400 -mt-2 mb-1">
                    n = {ghiScatterData.length} titik data
                  </p>
                </>
              )}

              <p className="text-[10px] text-slate-400 mt-2 flex items-center gap-1">
                <span className="material-symbols-outlined text-[13px]">picture_as_pdf</span>
                Grafik di atas akan tertanam sebagai canvas di PDF yang diunduh.
              </p>
            </div>

            {/* Perbandingan 3 sumber baseline */}
            <div className="bg-white dark:bg-card-dark border border-gray-200 dark:border-border-dark rounded-xl p-5 shadow-sm">
              <div className="flex items-center gap-2 mb-4">
                <span className="material-symbols-outlined text-violet-400 text-[20px]">compare_arrows</span>
                <h4 className="text-sm font-bold text-slate-900 dark:text-white">Perbandingan Sumber Baseline</h4>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Wind */}
                <div>
                  <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-primary text-[14px]">air</span>Angin (m/s)
                  </p>
                  <div className="flex flex-col gap-2">
                    {[
                      { label: 'Observasi Lapangan', value: `${station.windSpeed} m/s`, color: 'text-slate-900 dark:text-white', badge: null },
                      { label: 'GWA 3.0', value: station.windBaselineGwa != null ? `${station.windBaselineGwa} m/s` : '—', color: 'text-primary font-bold', badge: station.windBaselineGwa != null ? 'Aktif' : null },
                      { label: 'NASA POWER ERA5', value: station.windBaselineNasa != null ? `${station.windBaselineNasa} m/s` : '—', color: 'text-slate-600 dark:text-slate-400', badge: station.windBaselineGwa == null && station.windBaselineNasa != null ? 'Fallback' : null },
                    ].map((r) => (
                      <div key={r.label} className="flex items-center justify-between bg-slate-50 dark:bg-[#111a22] rounded-lg px-3 py-2 text-xs">
                        <span className="text-slate-500 dark:text-slate-400">{r.label}</span>
                        <div className="flex items-center gap-2">
                          <span className={`font-mono ${r.color}`}>{r.value}</span>
                          {r.badge && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/30">{r.badge}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                {/* Solar */}
                <div>
                  <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-amber-400 text-[14px]">wb_sunny</span>GHI (kWh/m²/hari)
                  </p>
                  <div className="flex flex-col gap-2">
                    {[
                      { label: 'Observasi Lapangan', value: `${station.irradiation.toFixed(2)} kWh/m²/hr`, color: 'text-slate-900 dark:text-white', badge: null },
                      { label: 'GSA Solargis', value: station.ghiBaselineGsa != null ? `${station.ghiBaselineGsa} kWh/m²/hr` : '—', color: 'text-amber-500 font-bold', badge: station.ghiBaselineGsa != null ? 'Aktif' : null },
                      { label: 'NASA POWER ERA5', value: station.ghiBaselineNasa != null ? `${station.ghiBaselineNasa} kWh/m²/hr` : '—', color: 'text-slate-600 dark:text-slate-400', badge: station.ghiBaselineGsa == null && station.ghiBaselineNasa != null ? 'Fallback' : null },
                    ].map((r) => (
                      <div key={r.label} className="flex items-center justify-between bg-slate-50 dark:bg-[#111a22] rounded-lg px-3 py-2 text-xs">
                        <span className="text-slate-500 dark:text-slate-400">{r.label}</span>
                        <div className="flex items-center gap-2">
                          <span className={`font-mono ${r.color}`}>{r.value}</span>
                          {r.badge && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-500 border border-amber-500/30">{r.badge}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

          {/* Row 4: Perbandingan Baseline + Potensi Energi — 2 kolom */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Energy potential */}
            <div className="bg-white dark:bg-card-dark border border-gray-200 dark:border-border-dark rounded-xl p-5 shadow-sm">
              <div className="flex items-center gap-2 mb-4">
                <span className="material-symbols-outlined text-yellow-400 text-[20px]">bolt</span>
                <h4 className="text-sm font-bold text-slate-900 dark:text-white">Potensi Energi</h4>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-blue-50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-800/30 rounded-xl p-4 text-center">
                  <span className="material-symbols-outlined text-blue-400 text-[24px] mb-1 block">air</span>
                  <p className="text-[10px] text-slate-400 uppercase tracking-wide">Kec. Angin Rata-rata</p>
                  <p className="text-2xl font-bold text-blue-400">
                    {station.windSpeed}
                    <span className="text-sm font-medium text-slate-400 ml-1">m/s</span>
                  </p>
                  <p className="text-[10px] text-slate-400 mt-1.5">Sumber: GWA 3.0</p>
                </div>
                <div className="bg-yellow-50 dark:bg-yellow-900/10 border border-yellow-100 dark:border-yellow-800/30 rounded-xl p-4 text-center">
                  <span className="material-symbols-outlined text-yellow-400 text-[24px] mb-1 block">wb_sunny</span>
                  <p className="text-[10px] text-slate-400 uppercase tracking-wide">Iradiasi Matahari (GHI)</p>
                  <p className="text-2xl font-bold text-yellow-400">
                    {station.irradiation}
                    <span className="text-sm font-medium text-slate-400 ml-1">kWh/m²/hari</span>
                  </p>
                  <p className="text-[10px] text-slate-400 mt-1.5">Sumber: GSA / SOLARGIS</p>
                </div>
                <div className="bg-green-50 dark:bg-green-900/10 border border-green-100 dark:border-green-800/30 rounded-xl p-4 text-center">
                  <span className="material-symbols-outlined text-green-400 text-[24px] mb-1 block">electric_bolt</span>
                  <p className="text-[10px] text-slate-400 uppercase tracking-wide">AEP PLTB (P50)</p>
                  <p className="text-2xl font-bold text-green-400">
                    {station.aep.toLocaleString('id')}
                    <span className="text-sm font-medium text-slate-400 ml-1">MWh/thn</span>
                  </p>
                  <p className="text-[10px] text-slate-400 mt-1.5">Estimasi ERA5 / MCP</p>
                </div>
                <div className="bg-amber-50 dark:bg-amber-900/10 border border-amber-100 dark:border-amber-800/30 rounded-xl p-4 text-center">
                  <span className="material-symbols-outlined text-amber-400 text-[24px] mb-1 block">solar_power</span>
                  <p className="text-[10px] text-slate-400 uppercase tracking-wide">Hasil Spesifik PLTS</p>
                  <p className="text-2xl font-bold text-amber-400">
                    {Math.round(station.irradiation * 365 * 0.75).toLocaleString('id')}
                    <span className="text-sm font-medium text-slate-400 ml-1">kWh/kWp·thn</span>
                  </p>
                  <p className="text-[10px] text-slate-400 mt-1.5">PR = 75% (asumsi)</p>
                </div>
              </div>
            </div>{/* end Potensi Energi card */}

            {/* GIS-MCDA */}
            <div className="bg-white dark:bg-card-dark border border-gray-200 dark:border-border-dark rounded-xl p-5 shadow-sm">
              <div className="flex items-center gap-2 mb-4">
                <span className="material-symbols-outlined text-emerald-400 text-[20px]">layers</span>
                <h4 className="text-sm font-bold text-slate-900 dark:text-white">Faktor Kesesuaian GIS-MCDA</h4>
                <span className="ml-auto font-bold text-sm text-slate-900 dark:text-white">
                  {station.score}/100
                </span>
              </div>
              <div className="space-y-3">
                {mcdaFactors.map((f) => (
                  <div key={f.label}>
                    <div className="flex justify-between text-xs text-slate-500 dark:text-text-secondary mb-1">
                      <span className="font-medium">{f.label}</span>
                      <span
                        className={`font-bold ${
                          f.pct >= 75 ? 'text-green-400' : f.pct >= 55 ? 'text-amber-400' : 'text-red-400'
                        }`}
                      >
                        {f.pct}%
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-slate-200 dark:bg-[#233648]">
                      <div
                        className={`h-2 rounded-full transition-all ${
                          f.pct >= 75 ? 'bg-green-500' : f.pct >= 55 ? 'bg-amber-400' : 'bg-red-400'
                        }`}
                        style={{ width: `${f.pct}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Row 5: Unduh Laporan */}
          <div className="bg-white dark:bg-card-dark border border-gray-200 dark:border-border-dark rounded-xl p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <span className="material-symbols-outlined text-primary text-[20px]">download</span>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">Unduh Laporan</h3>
            </div>
            <div className="flex flex-col gap-3">
              {[
                {
                  key: 'pdf' as const,
                  icon: 'picture_as_pdf',
                  iconColor: 'text-red-500',
                  bgColor: 'bg-red-50 dark:bg-red-900/20',
                  title: 'Laporan Presentasi (PDF)',
                  desc: 'Dokumen siap cetak berisi ringkasan eksekutif, peta potensi, grafik validasi, dan rekomendasi strategis. Cocok untuk presentasi ke pemangku kepentingan.',
                  btnClass: 'bg-primary hover:bg-blue-600 text-white shadow-lg shadow-blue-500/20',
                  hoverBorder: 'hover:border-primary/50',
                  onClick: handleExportPDF,
                },
                {
                  key: 'csv' as const,
                  icon: 'table_view',
                  iconColor: 'text-green-600',
                  bgColor: 'bg-green-50 dark:bg-green-900/20',
                  title: 'Data Analisis (CSV)',
                  desc: 'Dataset parameter validasi dan estimasi potensi energi. Format terstruktur untuk analisis lanjutan di spreadsheet atau Python.',
                  btnClass: 'bg-white dark:bg-transparent border border-gray-300 dark:border-gray-600 text-slate-700 dark:text-white hover:bg-gray-50 dark:hover:bg-gray-800',
                  hoverBorder: 'hover:border-green-500/50',
                  onClick: handleExportCSV,
                },
                {
                  key: 'geojson' as const,
                  icon: 'map',
                  iconColor: 'text-purple-500',
                  bgColor: 'bg-purple-50 dark:bg-purple-900/20',
                  title: 'Data Geospasial (GeoJSON)',
                  desc: 'Fitur geografis: titik stasiun beserta seluruh atribut validasi dan potensi energi. Siap untuk QGIS, ArcGIS, atau aplikasi peta web.',
                  btnClass: 'bg-white dark:bg-transparent border border-gray-300 dark:border-gray-600 text-slate-700 dark:text-white hover:bg-gray-50 dark:hover:bg-gray-800',
                  hoverBorder: 'hover:border-purple-500/50',
                  onClick: handleExportGeoJSON,
                },
              ].map((item) => (
                <div
                  key={item.title}
                  className={`group bg-white dark:bg-card-dark rounded-xl p-6 border border-gray-200 dark:border-border-dark ${item.hoverBorder} transition-all shadow-sm hover:shadow-md flex flex-col sm:flex-row items-start sm:items-center gap-5`}
                >
                  <div className={`size-14 rounded-xl ${item.bgColor} flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform`}>
                    <span className={`material-symbols-outlined ${item.iconColor} text-[32px]`}>{item.icon}</span>
                  </div>
                  <div className="flex-1">
                    <h4 className="text-base font-bold text-slate-900 dark:text-white mb-1">{item.title}</h4>
                    <p className="text-sm text-slate-500 dark:text-text-secondary leading-relaxed">{item.desc}</p>
                  </div>
                  <button
                    onClick={item.onClick}
                    disabled={exporting !== null}
                    className={`shrink-0 flex items-center gap-2 px-5 py-2.5 rounded-lg font-bold transition-all text-sm w-full sm:w-auto justify-center disabled:opacity-60 disabled:cursor-wait ${item.btnClass}`}
                  >
                    {exporting === item.key
                      ? <><span className="material-symbols-outlined text-[20px] animate-spin">refresh</span>Memproses...</>
                      : <><span className="material-symbols-outlined text-[20px]">download</span>Unduh</>
                    }
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}

export default function LaporanPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-background-light dark:bg-background-dark">
          <span className="material-symbols-outlined text-primary animate-spin text-[40px]">
            progress_activity
          </span>
        </div>
      }
    >
      <LaporanContent />
    </Suspense>
  );
}
