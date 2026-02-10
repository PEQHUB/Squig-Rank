# Squig-Rank

Live preference ranking tool for IEMs and headphones. Scores devices against target frequency response curves using the Preference Prediction Index (PPI).

Data sourced from 120+ squig.link measurement databases. ~18,000+ devices across 711 and B&K 5128 measurement rigs.

## PPI Formula

```
PPI = 100.0795 - (8.5 * STDEV) - (6.796 * |SLOPE|) - (3.475 * AVG_ERROR)
```

- STDEV: Standard deviation of error curve (20 Hz - 10 kHz)
- SLOPE: Linear regression slope of error vs log(frequency) (20 Hz - 10 kHz)
- AVG_ERROR: Mean absolute error in dB (40 Hz - 10 kHz)
- Curves normalized at 1 kHz, clamped to [0, 100]

## Features

- DF target curve builder with tilt, bass, and treble sliders
- Rank single rig, both rigs side-by-side, or all rigs combined
- Upload custom target curves for ranking
- Find acoustically similar devices
- Hide duplicate measurements
- Clone coupler filtering
- Harman and DF target presets
- 15 DF baseline targets

## Scanning

Automated scanner runs every 20 minutes via GitHub Actions. Incremental with checkpoint/resume, concurrent fetching across domains, and hash-based deduplication.

## Stack

React, TypeScript, Vite. Deployed to GitHub Pages.

## Development

```
npm install
npm run dev
```

## License

MIT
