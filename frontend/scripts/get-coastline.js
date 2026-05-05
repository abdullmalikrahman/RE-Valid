const https = require('https');
const fs = require('fs');

// Get the actual Java Sea coastline for Jawa Barat north coast from OSM Overpass API
// Bounding box: south=-6.5, west=106.8, north=-5.5, east=109.0
const query = `[out:json][timeout:25];
(
  way[natural=coastline](bbox:-6.5,106.8,-5.5,109.0);
);
out body;
>;
out skel qt;`;

const postData = `data=${encodeURIComponent(query)}`;

const options = {
  hostname: 'overpass-api.de',
  path: '/api/interpreter',
  method: 'POST',
  headers: {
    'Content-Type': 'application/x-www-form-urlencoded',
    'Content-Length': Buffer.byteLength(postData),
    'User-Agent': 'REValid-ProvinceBoundaryFix/1.0 (research use)'
  }
};

const req = https.request(options, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    const result = JSON.parse(data);
    const nodes = {};
    const ways = [];
    
    for (const el of result.elements) {
      if (el.type === 'node') nodes[el.id] = [el.lon, el.lat];
      if (el.type === 'way') ways.push(el);
    }
    
    console.log('Coastline ways found:', ways.length);
    console.log('Total nodes:', Object.keys(nodes).length);
    
    // Convert each way to coordinate array
    const wayCoords = [];
    for (const w of ways) {
      const coords = w.nodes.map(id => nodes[id]).filter(c => c);
      if (coords.length > 1) {
        wayCoords.push(coords);
        console.log(`Way ${w.id}: ${coords.length} nodes, lon ${coords[0][0].toFixed(3)} to ${coords[coords.length-1][0].toFixed(3)}`);
      }
    }
    
    // Try to chain ways into a single coastline (from west to east)
    // Sort by starting longitude
    wayCoords.sort((a, b) => a[0][0] - b[0][0]);
    
    // Output sample points
    wayCoords.forEach((coords, i) => {
      console.log(`\nWay ${i} (${coords.length} pts): `);
      // Print every 5th point
      for (let j = 0; j < coords.length; j += Math.max(1, Math.floor(coords.length/10))) {
        console.log(`  [${coords[j][0].toFixed(5)}, ${coords[j][1].toFixed(5)}]`);
      }
    });
    
    // Save the raw result for further processing
    fs.writeFileSync('C:/GitHub/RE-Valid/frontend/scripts/coastline-raw.json', 
      JSON.stringify({nodes, ways: wayCoords}, null, 2));
    console.log('\nSaved to coastline-raw.json');
  });
});

req.on('error', e => console.error('Error:', e.message));
req.write(postData);
req.end();
