# Squiglink Scanner

Scannerfor IEM frequency response similarity scores.

## Features

- Auto-loads all 2 custom targets on page load
- Scans all squig.link subdomains (17+ domains)
- Calculates weighted Pearson correlation similarity on-the-fly
- Displays top 25 IEMs per target in 2 columns (desktop) / 1 column with swipe (mobile)
- Filters by measurement quality (high/low) per target
- Tracks errors in local JSON file
- Sorts ties by price
- No measurement data storage
- 5-second API timeout

## Quality Domains

High quality measurements from:
- crinacle.squig.link
- earphonesarchive.squig.link
- sai.squig.link (all IEMs under [IEMs] brand)

All other domains are considered low quality.

## Targets

Place your custom target curves in `public/targets/` as `.txt` files with format:
```
frequency db
20 -5
25 -4
30 -3
...
```

## Development

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

## Deployment

### GitHub Pages

1. Update `homepage` in `package.json`
2. Run `npm run build`
3. Push to GitHub
4. Enable GitHub Pages in repo settings

### Vercel (API Functions)

1. Deploy to Vercel for serverless API functions
2. Configure environment variables if needed

## Daily Refresh

GitHub Actions runs daily at 3 AM UTC to trigger data refresh.

## License

MIT
