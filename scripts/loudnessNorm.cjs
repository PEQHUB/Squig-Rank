/**
 * ISO 226:2003 loudness normalization (CommonJS)
 * Faithfully ported from squig.link/CrinGraph graphtool.js
 * Source: https://github.com/squiglink/lab/blob/main/graphtool.js
 *
 * This is the CommonJS version for use in scanner/build scripts.
 * The TypeScript version lives at src/utils/loudnessNorm.ts
 */

// ============================================================================
// ISO 226:2003 EQUAL-LOUDNESS CONTOUR PARAMETERS
// ============================================================================

const ISO223_PARAMS = {
  f: [
    20, 25, 31.5, 40, 50, 63, 80, 100, 125, 160, 200, 250, 315, 400, 500,
    630, 800, 1000, 1250, 1600, 2000, 2500, 3150, 4000, 5000, 6300, 8000,
    10000, 12500
  ],
  a_f: [
    0.532, 0.506, 0.48, 0.455, 0.432, 0.409, 0.387, 0.367, 0.349, 0.33,
    0.315, 0.301, 0.288, 0.276, 0.267, 0.259, 0.253, 0.25, 0.246, 0.244,
    0.243, 0.243, 0.243, 0.242, 0.242, 0.245, 0.254, 0.271, 0.301
  ],
  L_U: [
    -31.6, -27.2, -23, -19.1, -15.9, -13, -10.3, -8.1, -6.2, -4.5, -3.1,
    -2, -1.1, -0.4, 0, 0.3, 0.5, 0, -2.7, -4.1, -1, 1.7, 2.5, 1.2, -2.1,
    -7.1, -11.2, -10.7, -3.1
  ],
  T_f: [
    78.5, 68.7, 59.5, 51.1, 44, 37.5, 31.5, 26.5, 22.1, 17.9, 14.4, 11.4,
    8.6, 6.2, 4.4, 3, 2.2, 2.4, 3.5, 1.7, -1.3, -4.2, -6, -5.4, -1.5, 6,
    12.6, 13.9, 12.3
  ]
};

// ============================================================================
// FREE-FIELD COMPENSATION TABLE
// ============================================================================

const FREE_FIELD_RAW = [
  0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0.0725,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.0896,0,0,0,0,0,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.0967,0,0,0,0,0,0,0,0.0886,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.0656,0,0,0,0,0,0.024,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.045,0,0,0,0,0,0,0.029,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1524,0.2,0.2,0.2386,0.3395,0.4,0.437,0.5,0.5287,0.6225,0.7,0.7063,0.7962,0.8,0.8941,0.9,0.9863,1,1.0729,1.1,1.1544,1.2,1.2504,1.3,1.3,1.3,1.3,1.3163,1.4,1.4,1.4,1.4,1.4017,1.4846,1.5,1.5,1.5748,1.6,1.6,1.653,1.7,1.7,1.7487,1.8,1.8341,1.9,1.9,1.9229,2,2,2,2.1,2.1,2.1897,2.2,2.2,2.2674,2.3,2.3,2.3567,2.4,2.4,2.4446,2.5,2.5262,2.6,2.6234,2.7149,2.8,2.8038,2.9011,2.9969,3.0913,3.1845,3.2762,3.3757,3.4649,3.5617,3.657,3.751,3.8,3.8432,3.9332,4,4,4,4.0121,4.1,4.1,4.1,4.0079,4,4,4,4,3.9334,3.9,3.9,3.9,3.8541,3.8,3.8,3.768,3.7,3.6761,3.6,3.6,3.5927,3.5,3.5,3.5,3.5,3.5,3.5761,3.6,3.6,3.6604,3.7,3.7514,3.8,3.8,3.8349,3.9,3.9218,4.0199,4.1123,4.2076,4.3016,4.3985,4.6816,5.0515,5.4222,5.8036,6.1097,6.4656,6.8461,7.3316,7.9083,8.4305,8.9369,9.5105,10.0759,10.6024,11.0027,11.4847,12.0482,12.5152,12.8994,13.2776,13.7381,14.1303,14.5168,14.8858,15.273,15.6547,15.9731,16.2596,16.542,16.7857,17.0111,17.2325,17.3532,17.522,17.6,17.6,17.6,17.6,17.5044,17.41,17.3145,17.2205,17.1255,17.0318,16.9373,16.784,16.6459,16.4536,16.2578,16.1234,15.967,15.8736,15.7552,15.566,15.3879,15.2881,15.0958,14.9064,14.8099,14.6287,14.5201,14.3477,14.2307,14.0709,13.9399,13.7916,13.6514,13.5552,13.4604,13.367,13.2718,13.1766,13.0812,12.9743,12.7916,12.6975,12.602,12.5078,12.3247,12.0547,11.7686,11.4154,11.1009,10.9385,10.7344,10.3998,10.0163,9.6382,9.2957,8.9799,8.6248,8.3404,8.0424,7.674,7.3851,7.0061,6.5307,6.1484,5.7696,5.4662,5.1084,4.7302,4.3498,3.971,3.6455,3.4075,3.1343,2.7917,2.5376,2.3484,2.1585,1.9849,1.9107,2,2,2,2.0894,2.1844,2.2787,2.374,2.6057,2.8265,3.0161,3.2057,3.3954,3.5851,3.8122,4.0967,4.354,4.5651,4.8509,5.1459,5.5259,5.9041,6.1881,6.5643,6.8561,7.1418,7.4251,7.7093,8.0593,8.3192,8.4541,8.5493,8.6437,8.7,8.7336,8.8,8.8,8.8,8.8,8.7926,8.7,8.7,8.6079,8.5133,8.5,8.4237,8.1863,7.968,7.7786,7.4219,6.948,6.4299,5.8212,5.1563,4.4634,3.7042,2.8897,1.9005,1.2368,0.5651,-0.2856,-0.8593,-2.9
];

// Apply the -7 dB offset as in the original source
const FREE_FIELD = FREE_FIELD_RAW.map(v => v - 7);

// ============================================================================
// NORMALIZATION PARAMETERS (precomputed per frequency point)
// ============================================================================

/**
 * Precompute ISO 226 normalization parameters for a set of frequencies.
 * Faithfully reproduces init_normalize() from graphtool.js.
 */
function initNormalize(freqs) {
  const params = [];
  const p = ISO223_PARAMS;
  let i = 0;

  for (const f of freqs) {
    if (f >= p.f[i]) {
      i++;
    }
    const i0 = Math.max(0, i - 1);
    const i1 = Math.min(i, p.f.length - 1);

    let a, m, k;
    if (i0 === i1) {
      a = p.a_f[i0];
      const L_U_val = p.L_U[i0];
      const T_f_val = p.T_f[i0];
      m = a * (Math.log10(4) - 10 + L_U_val / 10);
      k = (0.005076 / Math.pow(10, m)) - Math.pow(10, a * T_f_val / 10);
    } else {
      const ll = [p.f[i0], p.f[i1], f].map(x => Math.log(x));
      const l = (ll[2] - ll[0]) / (ll[1] - ll[0]);

      const a_f_val = p.a_f[i0] + l * (p.a_f[i1] - p.a_f[i0]);
      const L_U_val = p.L_U[i0] + l * (p.L_U[i1] - p.L_U[i0]);
      const T_f_val = p.T_f[i0] + l * (p.T_f[i1] - p.T_f[i0]);

      a = a_f_val;
      m = a * (Math.log10(4) - 10 + L_U_val / 10);
      k = (0.005076 / Math.pow(10, m)) - Math.pow(10, a * T_f_val / 10);
    }

    const c = Math.pow(10, 9.4 + 4 * m) / freqs.length;

    const ffIndex = Math.floor(0.5 + 48 * Math.log2(f / 19.4806));
    const freeField = FREE_FIELD[Math.max(0, Math.min(479, ffIndex))];

    params.push({ a, k, c, freeField });
  }

  return params;
}

// ============================================================================
// LOUDNESS-WEIGHTED CENTER
// ============================================================================

/**
 * Compute the loudness-weighted average dB of a curve.
 * Returns a single dB value representing the perceptual center.
 */
function loudnessWeightedCenter(frequencies, db) {
  const params = initNormalize(frequencies);
  let weightedSum = 0;
  let totalWeight = 0;
  const l10 = Math.log(10) / 10;

  for (let i = 0; i < params.length; i++) {
    const { a, k, c, freeField } = params[i];
    const v0 = Math.exp(l10 * (db[i] - freeField));
    const v1 = k + Math.pow(v0, a);
    const weight = c * 4 * Math.pow(v1, 3) * a * Math.pow(v0, a - 1) * l10 * v0;
    weightedSum += db[i] * weight;
    totalWeight += weight;
  }

  return totalWeight > 0 ? weightedSum / totalWeight : db.reduce((a, b) => a + b, 0) / db.length;
}

// ============================================================================
// LOUDNESS NORMALIZATION (find offset in dB)
// ============================================================================

const DEFAULT_NORM_PHON = 60;

/**
 * Compute the total perceived loudness of a curve in phon
 * using the ISO 226:2003 Stevens power law.
 */
function computeLoudness(frequencies, db) {
  const params = initNormalize(frequencies);
  const l10 = Math.log(10) / 10;
  let v = 0;

  for (let i = 0; i < params.length; i++) {
    const { a, k, c, freeField } = params[i];
    const v0 = Math.exp(l10 * (db[i] - freeField));
    const v1 = k + Math.pow(v0, a);
    v += c * Math.pow(v1, 4);
  }

  return Math.log(v) / l10;
}

/**
 * Find the dB offset that makes the total perceived loudness of a curve
 * equal to the target loudness in phon.
 * Faithfully reproduces find_offset() from graphtool.js, with a better
 * initial guess for robustness with absolute SPL or relative dB data.
 */
function findLoudnessOffset(frequencies, db, targetPhon) {
  if (targetPhon === undefined) targetPhon = DEFAULT_NORM_PHON;
  const params = initNormalize(frequencies);
  const l10 = Math.log(10) / 10;
  // Start with an initial guess based on average dB level
  const avgDb = db.reduce((a, b) => a + b, 0) / db.length;
  let x = avgDb - targetPhon;

  function getStep(o) {
    let v = 0;
    let d = 0;

    for (let i = 0; i < params.length; i++) {
      const { a, k, c, freeField } = params[i];
      const v0 = Math.exp(l10 * (db[i] + o - freeField));
      const ds = l10 * v0;
      const v1 = k + Math.pow(v0, a);
      const ds2 = ds * a * Math.pow(v0, a - 1);
      v += c * Math.pow(v1, 4);
      d += c * 4 * Math.pow(v1, 3) * ds2;
    }

    return (Math.log(v) - targetPhon * l10) * (v / d);
  }

  let dx;
  let iterations = 0;
  const MAX_ITERATIONS = 100;
  do {
    dx = getStep(x);
    x -= dx;
    iterations++;
  } while (Math.abs(dx) > 0.01 && iterations < MAX_ITERATIONS);

  return x;
}

module.exports = {
  ISO223_PARAMS,
  FREE_FIELD,
  DEFAULT_NORM_PHON,
  initNormalize,
  computeLoudness,
  loudnessWeightedCenter,
  findLoudnessOffset
};
