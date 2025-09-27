# AstroTrack

Static top-down map of planetary positions using NASA/JPL Horizons API data.

## What it does
- Displays Sun-centered ecliptic position vectors (X, Y, Z in AU) for the major planets and spacecraft.
- Renders a simple top-down canvas map (ecliptic plane) with adjustable scale and zoom.
- Uses pre-generated data updated daily via GitHub Actions.

## Run it locally

```bash
# From the project root - serve static files
npm run serve
# Open http://localhost:8080 in your browser
```

Or simply open `public/index.html` in your browser directly.

## Data Generation

The data is automatically updated daily via GitHub Actions, but you can also generate fresh data manually:

```bash
# Install dependencies for data generation
npm install
# Generate fresh data from NASA Horizons API
npm run generate
```

This will update `public/data/positions.json` with current planetary positions.

## Technical notes
- **Frontend**: Static files in `public/` load data from `public/data/positions.json`
- **Data Source**: NASA/JPL Horizons API with:
  - `EPHEM_TYPE=VECTORS`, `CENTER='500@10'` (Sun), `REF_PLANE=ECLIPTIC`, `OUT_UNITS=AU-D`, `VEC_TABLE=1`, `CSV_FORMAT=YES`
  - Planets queried: Mercury..Neptune using NAIF IDs 199,299,399,499,599,699,799,899, plus Pluto system barycenter (999)
  - Spacecraft from `config/spacecraft.json`
- **No server required**: Pure static HTML/CSS/JavaScript

## GitHub Actions Integration
The included GitHub Action automatically:
1. Runs `npm run generate` daily
2. Updates the positions data
3. Commits changes back to the repository

## Known considerations
- Data is updated daily, not in real-time
- For a fuller solar system (moons, dwarf planets), extend the planet list in `scripts/generate_data.js`

## Credits
- Data from NASA/JPL Horizons. See https://ssd-api.jpl.nasa.gov/doc/horizons.html

```
Target coordinate system: Sun-centered, ecliptic plane (J2000), units AU.
```