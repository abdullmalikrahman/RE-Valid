const https = require('https');
const fs = require('fs');

// Fetch the Jawa Barat north coast from superpikar indonesia-province-simple.json
const url = 'https://raw.githubusercontent.com/superpikar/indonesia-geojson/master/indonesia-province-simple.json';

const options = {
  headers: { 'User-Agent': 'REValid-ProvinceBoundaryFix/1.0 (research use)' }
};

https.get(url, options, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    const geojson = JSON.parse(data);
    const features = geojson.features || geojson;
    
    // Find Jawa Barat (kode=32)
    let jabarFeature = null;
    for (const f of features) {
      const p = f.properties || {};
      if (p.kode === '32' || p.id === 15 || p.name === 'JAWA BARAT' || p.state === 'Jawa Barat') {
        console.log('Found:', JSON.stringify(p));
        jabarFeature = f;
        break;
      }
    }
    
    if (!jabarFeature) {
      console.log('Available features:');
      features.slice(0, 5).forEach(f => console.log(JSON.stringify(f.properties)));
      return;
    }
    
    const geom = jabarFeature.geometry;
    let ring;
    if (geom.type === 'Polygon') {
      ring = geom.coordinates[0];
    } else if (geom.type === 'MultiPolygon') {
      let largest = [];
      for (const poly of geom.coordinates) {
        if (poly[0].length > largest.length) largest = poly[0];
      }
      ring = largest;
    }
    
    console.log('Ring length:', ring.length);
    
    // Print all points
    ring.forEach((p, i) => {
      console.log(`${i}: [${p[0]}, ${p[1]}]`);
    });
  });
}).on('error', e => console.error(e.message));
