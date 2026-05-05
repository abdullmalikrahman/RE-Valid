const https = require('https');
const fs = require('fs');

const url = 'https://nominatim.openstreetmap.org/search.php?q=Jawa+Barat&polygon_geojson=1&format=json&featuretype=state&limit=5';

const options = {
  headers: {
    'User-Agent': 'REValid-ProvinceBoundaryFix/1.0 (research use)'
  }
};

https.get(url, options, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    const results = JSON.parse(data);
    const jabar = results[0];
    const ring = jabar.geojson.coordinates[0];
    console.log('Total original points:', ring.length);

    // Find the index of the extreme north island point (lat > -5.0)
    let islandIdx = -1;
    for (let i = 0; i < ring.length; i++) {
      if (ring[i][1] > -4.5) {
        islandIdx = i;
        console.log('Island point at index', i, ':', ring[i]);
        break;
      }
    }

    if (islandIdx > 10) {
      // Print 20 points before and after the island
      console.log('\n--- 30 points BEFORE the island ---');
      for (let i = Math.max(0, islandIdx-30); i < islandIdx; i++) {
        console.log('idx=' + i + ' [' + ring[i][0].toFixed(4) + ', ' + ring[i][1].toFixed(4) + ']');
      }
      console.log('\n--- 30 points AFTER the island ---');
      for (let i = islandIdx; i < Math.min(ring.length, islandIdx+30); i++) {
        console.log('idx=' + i + ' [' + ring[i][0].toFixed(4) + ', ' + ring[i][1].toFixed(4) + ']');
      }
    }

    // Also find points with lat > -6.3 (north coast) NOT near the island
    console.log('\n--- North coast points (lat > -6.0) sorted by index ---');
    for (let i = 0; i < ring.length; i++) {
      if (ring[i][1] > -6.0) {
        console.log('idx=' + i + ' [' + ring[i][0].toFixed(4) + ', ' + ring[i][1].toFixed(4) + ']');
      }
    }
  });
}).on('error', e => console.error(e.message));
