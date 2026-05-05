const https = require('https');
const fs = require('fs');

const url = 'https://nominatim.openstreetmap.org/search.php?q=Jawa+Barat&polygon_geojson=1&format=json&featuretype=state&limit=5';

function perpDistance(point, lineStart, lineEnd) {
  const dx = lineEnd[0] - lineStart[0];
  const dy = lineEnd[1] - lineStart[1];
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) {
    return Math.sqrt((point[0] - lineStart[0]) ** 2 + (point[1] - lineStart[1]) ** 2);
  }
  return Math.abs(dy * point[0] - dx * point[1] + lineEnd[0] * lineStart[1] - lineEnd[1] * lineStart[0]) / Math.sqrt(len2);
}

function ramerDouglasPeucker(points, epsilon) {
  if (points.length <= 2) return points;
  let maxDist = 0;
  let maxIdx = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const d = perpDistance(points[i], points[0], points[points.length - 1]);
    if (d > maxDist) { maxDist = d; maxIdx = i; }
  }
  if (maxDist > epsilon) {
    const left = ramerDouglasPeucker(points.slice(0, maxIdx + 1), epsilon);
    const right = ramerDouglasPeucker(points.slice(maxIdx), epsilon);
    return [...left.slice(0, -1), ...right];
  }
  return [points[0], points[points.length - 1]];
}

const options = {
  headers: {
    'User-Agent': 'REValid-ProvinceBoundaryFix/1.0 (github.com/re-valid; research use)'
  }
};

https.get(url, options, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    const results = JSON.parse(data);
    console.log('Results count:', results.length);
    
    // Find the mainland West Java result
    let jabar = null;
    for (const r of results) {
      console.log(`  ${r.display_name} | lat=${r.lat} | bbox=${r.boundingbox}`);
      if (r.geojson && (r.display_name.includes('West Java') || r.display_name.includes('Jawa Barat'))) {
        jabar = r;
        break;
      }
    }
    
    if (!jabar) {
      console.error('West Java not found!');
      process.exit(1);
    }

    let ring;
    const geom = jabar.geojson;
    console.log('GeoJSON type:', geom.type);
    
    if (geom.type === 'Polygon') {
      ring = geom.coordinates[0];
    } else if (geom.type === 'MultiPolygon') {
      // Pick the largest ring
      let largest = [];
      for (const poly of geom.coordinates) {
        if (poly[0].length > largest.length) largest = poly[0];
      }
      ring = largest;
    } else {
      console.error('Unknown type:', geom.type);
      process.exit(1);
    }
    
    console.log('Original points:', ring.length);
    
    // Apply Douglas-Peucker with epsilon ~0.002 degrees (~220m)
    const epsilon = 0.002;
    const simplified = ramerDouglasPeucker(ring, epsilon);
    console.log('Simplified points (epsilon=0.002):', simplified.length);
    
    // Try a bit more aggressive if needed
    const epsilon2 = 0.005;
    const simplified2 = ramerDouglasPeucker(ring, epsilon2);
    console.log('Simplified points (epsilon=0.005):', simplified2.length);
    
    const epsilon3 = 0.001;
    const simplified3 = ramerDouglasPeucker(ring, epsilon3);
    console.log('Simplified points (epsilon=0.001):', simplified3.length);

    // Use epsilon=0.002 for a good balance of accuracy vs file size
    const geojson = {
      type: 'Polygon',
      coordinates: [simplified]
    };
    
    const outPath = 'C:/GitHub/RE-Valid/frontend/public/geodata/jabar-banten.json';
    fs.writeFileSync(outPath, JSON.stringify(geojson, null, 2));
    console.log('Saved to', outPath);
    
    // Also log lon/lat range for verification
    const lons = simplified.map(p => p[0]);
    const lats = simplified.map(p => p[1]);
    console.log(`Lon range: ${Math.min(...lons).toFixed(4)} to ${Math.max(...lons).toFixed(4)}`);
    console.log(`Lat range: ${Math.min(...lats).toFixed(4)} to ${Math.max(...lats).toFixed(4)}`);
    
    // Print northernmost points
    console.log('\nNorthernmost points (lat > -6.3):');
    simplified.filter(p => p[1] > -6.3).forEach(p => console.log(`  [${p[0].toFixed(4)}, ${p[1].toFixed(4)}]`));
  });
}).on('error', (e) => {
  console.error('Error:', e.message);
});
