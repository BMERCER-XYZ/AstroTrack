# AstroTrack

Live top-down map of planetary positions using NASA/JPL Horizons API.

## What it does
- Queries Horizons for Sun-centered ecliptic position vectors (X, Y, Z in AU) for the major planets.
- Renders a simple top-down canvas map (ecliptic plane) with adjustable scale.
- Auto-refreshes roughly once per minute.

## Run it (Windows PowerShell)

```powershell
# From the project root
npm install
npm start
# Open http://localhost:3000 in your browser
```

## Technical notes
- Backend: Node + Express. Endpoint `GET /api/positions` queries the Horizons API with:
  - `EPHEM_TYPE=VECTORS`, `CENTER='500@10'` (Sun), `REF_PLANE=ECLIPTIC`, `OUT_UNITS=AU-D`, `VEC_TABLE=1`, `CSV_FORMAT=YES`, `TLIST='<current UTC>'`.
  - Planets queried: Mercury..Neptune using NAIF IDs 199,299,399,499,599,699,799,899, plus Pluto system barycenter (999).
- Frontend: Static files in `public/` draw the scene and fetch periodically.
- Simple in-memory cache (~55s) reduces API calls.

## Known considerations
- Horizons may rate-limit or return 503 during heavy load; the UI will show an error.
- If `CSV_FORMAT` structure changes, the parser in `src/server.js` may need adjustment.
- For a fuller solar system (moons, dwarf planets), extend the `PLANETS` list accordingly.

## Credits
- Data from NASA/JPL Horizons. See https://ssd-api.jpl.nasa.gov/doc/horizons.html

```
Target coordinate system: Sun-centered, ecliptic plane (J2000), units AU.
```