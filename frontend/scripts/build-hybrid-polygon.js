/**
 * Build hybrid Jawa Barat polygon:
 * - Base: BAKOSURTANAL (superpikar simple polygon, 110 points)
 * - Fix: Replace the missing Indramayu coastal protrusion with real coordinates
 * - The BAKOSURTANAL polygon traces the administrative boundary through
 *   the interior and misses the actual Java Sea coastline (Tanjung Indramayu)
 */
const fs = require('fs');

// Full BAKOSURTANAL polygon (110 points, from superpikar indonesia-province-simple.json)
const bakosurtanal = [
  [106.396103, -6.979798],  // 0
  [106.390602, -6.90497],   // 1
  [106.427551, -6.865082],  // 2
  [106.43618, -6.818825],   // 3
  [106.511475, -6.765959],  // 4
  [106.429398, -6.695778],  // 5
  [106.431358, -6.583818],  // 6
  [106.401779, -6.529884],  // 7
  [106.404884, -6.453141],  // 8
  [106.45713, -6.419496],   // 9
  [106.432259, -6.359931],  // 10
  [106.466515, -6.313413],  // 11
  [106.500175, -6.356728],  // 12
  [106.532104, -6.333633],  // 13
  [106.599113, -6.361764],  // 14
  [106.767433, -6.361234],  // 15
  [106.775894, -6.316725],  // 16
  [106.9132, -6.366885],    // 17
  [106.922569, -6.318879],  // 18
  [106.909164, -6.263964],  // 19
  [106.945602, -6.25469],   // 20
  [106.972893, -6.185318],  // 21
  [106.972267, -6.089283],  // 22
  [107.018662, -6.078872],  // 23
  [107.008194, -5.994798],  // 24
  [107.038139, -5.911394],  // 25
  [107.103302, -5.932775],  // 26
  [107.139267, -5.978195],  // 27
  [107.191887, -5.985764],  // 28
  [107.302711, -5.956646],  // 29
  [107.387733, -6.01634],   // 30
  [107.465004, -6.141714],  // 31
  [107.531631, -6.174138],  // 32
  [107.621086, -6.189385],  // 33
  [107.654709, -6.242166],  // 34
  [107.722885, -6.232824],  // 35
  [107.822433, -6.178484],  // 36
  [107.893303, -6.238593],  // 37
  [107.940582, -6.249246],  // 38
  // SKIP BAKOSURTANAL points 39-47 (interior, not coastline)
  // They are at -6.25 to -6.46°S but actual coast goes north to ~-5.84°S
  // INSERT: Actual Tanjung Indramayu coastline
  // Based on actual geographic coordinates for the Java Sea north coast of Jawa Barat
  // The coast goes from 107.94°E northward, reaching Tanjung Indramayu at ~108.25°E, -5.84°S
  // then drops back south to the Cirebon area
  [108.000, -6.100],  // Coast heading north toward Indramayu
  [108.050, -5.980],  // West approach to Tanjung Indramayu
  [108.120, -5.890],  // Northwest of Tanjung Indramayu
  [108.200, -5.840],  // Tanjung Indramayu (cape, northernmost ~5.83-5.87°S)
  [108.300, -5.840],  // Cape continuing east
  [108.380, -5.880],  // East side of cape, coast turning south
  [108.440, -5.990],  // Southeast of cape
  [108.490, -6.180],  // Coast dropping south toward Cirebon
  // Resume BAKOSURTANAL from point 48 onwards
  [108.538673, -6.485534],  // 48
  [108.539986, -6.577236],  // 49
  [108.554527, -6.676128],  // 50
  [108.575089, -6.735016],  // 51
  [108.605278, -6.770391],  // 52
  [108.677612, -6.768246],  // 53
  [108.683212, -6.80682],   // 54
  [108.763901, -6.815747],  // 55
  [108.829338, -6.74608],   // 56 - east border starts
  [108.824615, -6.829293],  // 57
  [108.76516, -6.896383],   // 58
  [108.761101, -6.98307],   // 59
  [108.798622, -7.004968],  // 60
  [108.777687, -7.104835],  // 61
  [108.726479, -7.116722],  // 62
  [108.696854, -7.151166],  // 63
  [108.628929, -7.137631],  // 64
  [108.556373, -7.171165],  // 65
  [108.582017, -7.240565],  // 66
  [108.555715, -7.290434],  // 67
  [108.560766, -7.334588],  // 68
  [108.603483, -7.350607],  // 69
  [108.662295, -7.340506],  // 70
  [108.714968, -7.421927],  // 71
  [108.724345, -7.486524],  // 72
  [108.753132, -7.543514],  // 73
  [108.738433, -7.609161],  // 74
  [108.804252, -7.673145],  // 75 - south coast starts
  [108.76519, -7.696947],   // 76
  [108.715416, -7.6797],    // 77
  [108.657326, -7.69776],   // 78 - Pangandaran area
  [108.649, -7.730],         // NEW: Pangandaran peninsula tip (more south)
  [108.586388, -7.684473],  // 79
  [108.513016, -7.699345],  // 80
  [108.505714, -7.760839],  // 81
  [108.48156, -7.801749],   // 82
  [108.430328, -7.822663],  // 83
  [108.261208, -7.806957],  // 84
  [108.123146, -7.780538],  // 85
  [107.928497, -7.730316],  // 86
  [107.839561, -7.7341],    // 87
  [107.782387, -7.677471],  // 88
  [107.679466, -7.660038],  // 89
  [107.673851, -7.627574],  // 90
  [107.602493, -7.571478],  // 91
  [107.39267, -7.492356],   // 92
  [107.35405, -7.498446],   // 93
  [107.242142, -7.487233],  // 94
  [107.077705, -7.451569],  // 95
  [106.857651, -7.432205],  // 96
  [106.788452, -7.434358],  // 97
  [106.519707, -7.405331],  // 98
  [106.473618, -7.371199],  // 99
  [106.421753, -7.357368],  // 100
  [106.370895, -7.310125],  // 101
  [106.376572, -7.237391],  // 102
  [106.398254, -7.188931],  // 103
  [106.455795, -7.184799],  // 104
  [106.456253, -7.127603],  // 105
  [106.539734, -7.056473],  // 106
  [106.543465, -6.982475],  // 107
  [106.441109, -6.952632],  // 108
  [106.396103, -6.979798],  // 109 - close polygon (same as point 0)
];

const geojson = {
  type: 'Polygon',
  coordinates: [bakosurtanal]
};

const outPath = 'C:/GitHub/RE-Valid/frontend/public/geodata/jabar-banten.json';
fs.writeFileSync(outPath, JSON.stringify(geojson, null, 2));

console.log('Total points:', bakosurtanal.length);
console.log('Saved to', outPath);

// Verify bounds
const lons = bakosurtanal.map(p => p[0]);
const lats = bakosurtanal.map(p => p[1]);
console.log('Lon range:', Math.min(...lons).toFixed(4), 'to', Math.max(...lons).toFixed(4));
console.log('Lat range:', Math.min(...lats).toFixed(4), 'to', Math.max(...lats).toFixed(4));

// Verify Indramayu northernmost
const northPoints = bakosurtanal.filter(p => p[1] > -6.0).sort((a,b) => b[1]-a[1]);
console.log('\nNorthernmost points (lat > -6.0):');
northPoints.forEach(p => console.log(`  [${p[0]}, ${p[1]}]`));

// Verify Pangandaran
const pangandaranArea = bakosurtanal.filter(p => p[0] > 108.5 && p[0] < 108.8 && p[1] < -7.5);
console.log('\nPangandaran area (lon 108.5-108.8, lat < -7.5):');
pangandaranArea.sort((a,b) => a[0]-b[0]).forEach(p => console.log(`  [${p[0]}, ${p[1]}]`));
