#!/usr/bin/env python3
"""
Daily astronomy data updater script for AstroTrack
Fetches data from JPL Horizons API and updates JSON file
"""

import json
import requests
from datetime import datetime, timedelta
import os
import sys

# Configuration
HORIZONS_API_URL = "https://ssd.jpl.nasa.gov/api/horizons.api"
OUTPUT_FILE = "astronomy_data.json"

# Default celestial bodies to track (you can modify this list)
CELESTIAL_BODIES = {
    "10": "Sun",
    "301": "Moon", 
    "399": "Earth",
    "499": "Mars",
    "599": "Jupiter",
    "699": "Saturn"
}

def fetch_horizons_data(body_id, body_name):
    """
    Fetch ephemeris data from JPL Horizons API for a specific celestial body
    """
    # Use a single timestamp (current UTC) for TLIST
    time_str = datetime.utcnow().strftime('%Y-%m-%d %H:%M')
    # Horizons API parameters (matching JS version)
    params = {
        'format': 'json',
        'COMMAND': f"'{body_id}'",
        'MAKE_EPHEM': 'YES',
        'EPHEM_TYPE': 'VECTORS',
        'CENTER': "'500@10'",  # Heliocentric
        'REF_PLANE': 'ECLIPTIC',
        'OUT_UNITS': 'AU-D',
        'VEC_TABLE': '1',
        'CSV_FORMAT': 'YES',
        'VEC_LABELS': 'YES',
        'TIME_TYPE': 'UT',
        'TLIST': f"'{time_str}'"
    }
    
    try:
        print(f"Fetching data for {body_name} (ID: {body_id})...")
        response = requests.get(HORIZONS_API_URL, params=params, timeout=30)
        response.raise_for_status()
        
        data = response.json()
        
        # Extract relevant information
        result = {
            "body_id": body_id,
            "body_name": body_name,
            "last_updated": datetime.now().isoformat(),
            "data_source": "JPL Horizons API",
            "ephemeris_data": data.get("result", "No ephemeris data available")
        }
        
        return result
        
    except requests.exceptions.RequestException as e:
        print(f"Error fetching data for {body_name}: {e}")
        return {
            "body_id": body_id,
            "body_name": body_name,
            "last_updated": datetime.now().isoformat(),
            "error": str(e),
            "data_source": "JPL Horizons API"
        }
    except Exception as e:
        print(f"Unexpected error for {body_name}: {e}")
        return {
            "body_id": body_id,
            "body_name": body_name,
            "last_updated": datetime.now().isoformat(),
            "error": str(e),
            "data_source": "JPL Horizons API"
        }

def load_existing_data():
    """
    Load existing JSON data if file exists
    """
    if os.path.exists(OUTPUT_FILE):
        try:
            with open(OUTPUT_FILE, 'r', encoding='utf-8') as f:
                return json.load(f)
        except (json.JSONDecodeError, IOError) as e:
            print(f"Error loading existing data: {e}")
            return {}
    return {}

def save_data(data):
    """
    Save data to JSON file
    """
    try:
        with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
        print(f"Data successfully saved to {OUTPUT_FILE}")
        return True
    except IOError as e:
        print(f"Error saving data: {e}")
        return False

def main():
    """
    Main function to update astronomy data
    """
    print("Starting astronomy data update...")
    print(f"Timestamp: {datetime.now().isoformat()}")
    
    # Load existing data
    all_data = load_existing_data()
    
    # Initialize structure if needed
    if "metadata" not in all_data:
        all_data["metadata"] = {
            "created": datetime.now().isoformat(),
            "description": "Daily astronomy data from JPL Horizons API",
            "repository": "AstroTrack"
        }
    
    all_data["metadata"]["last_updated"] = datetime.now().isoformat()
    
    if "celestial_bodies" not in all_data:
        all_data["celestial_bodies"] = {}
    
    # Fetch data for each celestial body
    successful_updates = 0
    total_bodies = len(CELESTIAL_BODIES)
    
    for body_id, body_name in CELESTIAL_BODIES.items():
        body_data = fetch_horizons_data(body_id, body_name)
        all_data["celestial_bodies"][body_id] = body_data
        
        if "error" not in body_data:
            successful_updates += 1
    
    # Update summary
    all_data["metadata"]["total_bodies"] = total_bodies
    all_data["metadata"]["successful_updates"] = successful_updates
    all_data["metadata"]["last_run_status"] = "success" if successful_updates > 0 else "failed"
    
    # Save updated data
    if save_data(all_data):
        print(f"Update completed successfully! {successful_updates}/{total_bodies} bodies updated.")
        sys.exit(0)
    else:
        print("Failed to save data!")
        sys.exit(1)

if __name__ == "__main__":
    main()