# RE-Valid Compliance Automation

Modul kepatuhan resmi bekerja dengan cara overlay koordinat stasiun terhadap layer resmi yang sudah diimpor ke database PostGIS.

Status `Terverifikasi` hanya dapat muncul jika data/dokumen resmi yang dibutuhkan tersedia. Jika layer belum diimpor, sistem akan menampilkan `Belum Ada Data Resmi`.

## Kategori Layer

Gunakan nilai `category` berikut saat impor GeoJSON:

- `rdtr`, `rtrw`, atau `kkpr` untuk tata ruang.
- `kawasan_lindung`, `kawasan_hutan`, atau `konservasi` untuk pembatas kawasan.
- `bencana` atau `risiko_bencana` untuk risiko bencana.
- `tanah` atau `status_tanah` untuk status/penguasaan tanah.
- `grid`, `interkoneksi`, atau `transmisi` untuk jaringan listrik.

## Status Rule Fitur

Setiap fitur GeoJSON dapat diberi status:

- `allowed`: lokasi diperbolehkan menurut layer tersebut.
- `conditional`: lokasi bersyarat atau perlu kajian.
- `restricted`: lokasi tidak sesuai/terlarang.
- `review`: perlu tinjau karena aturan belum final.
- `informational`: hanya informasi pendukung.

## Endpoint Import

Endpoint:

```http
POST /api/v1/compliance/layers/import-geojson
```

Endpoint ini membutuhkan token login. Contoh payload:

```json
{
  "code": "rdtr_purwakarta_2026",
  "name": "RDTR Purwakarta 2026",
  "category": "rdtr",
  "source": "ATR/BPN atau Pemda",
  "source_url": "https://contoh-sumber-resmi.go.id",
  "source_date": "2026-06-05",
  "is_official": true,
  "name_property": "zona",
  "status_property": "status_energi",
  "message_property": "catatan",
  "default_status_rule": "review",
  "status_map": {
    "boleh": "allowed",
    "bersyarat": "conditional",
    "dilarang": "restricted"
  },
  "replace": true,
  "geojson": {
    "type": "FeatureCollection",
    "features": []
  }
}
```

Setelah layer diimpor, status kepatuhan per stasiun dapat dicek otomatis melalui:

```http
GET /api/v1/compliance/stations/{station_id}
```

## Catatan

Jangan memakai hasil scraping peta pemerintah sebagai keputusan resmi. Gunakan API resmi, unduhan layer resmi, atau dokumen resmi yang dapat diaudit.
