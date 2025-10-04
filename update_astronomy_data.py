#!/usr/bin/env python3
"""
Daily astronomy data updater script for AstroTrack
Fetches data from JPL Horizons API and updates JSON file
"""

import json
import requests
from datetime import datetime, timedelta, timezone
import os
import sys
import re

# Configuration
HORIZONS_API_URL = "https://ssd.jpl.nasa.gov/api/horizons.api"
OUTPUT_FILE = "astronomy_data.json"

# Default celestial bodies to track (you can modify this list)
CELESTIAL_BODIES = {
    "199": "Mercury",
    "299": "Venus",
    "399": "Earth",
    "499": "Mars",
    "599": "Jupiter",
    "699": "Saturn",
    "799": "Uranus",
    "899": "Neptune"
}

def parse_vector_data(response_text):
    """
    Parse the vector data from JPL Horizons API response
    """
    try:
        # Look for the data section between $$SOE and $$EOE
        soe_match = re.search(r'\$\$SOE\s*\n(.*?)\n\$\$EOE', response_text, re.DOTALL)
        if not soe_match:
            return None
            
        data_section = soe_match.group(1).strip()
        lines = data_section.split('\n')
        
        for line in lines:
            line = line.strip()
            if not line or line.startswith('*'):
                continue
                
            # Look for lines that contain X = Y = Z = coordinates
            if 'X =' in line and 'Y =' in line and 'Z =' in line:
                # Parse format: " X = 9.808796917387812E-01 Y = 1.956823623680619E-01 Z =-1.639457656712521E-05"
                try:
                    # Extract X, Y, Z values using regex
                    x_match = re.search(r'X\s*=\s*([-+]?[0-9]*\.?[0-9]+(?:[eE][-+]?[0-9]+)?)', line)
                    y_match = re.search(r'Y\s*=\s*([-+]?[0-9]*\.?[0-9]+(?:[eE][-+]?[0-9]+)?)', line)
                    z_match = re.search(r'Z\s*=\s*([-+]?[0-9]*\.?[0-9]+(?:[eE][-+]?[0-9]+)?)', line)
                    
                    if x_match and y_match and z_match:
                        x = float(x_match.group(1))
                        y = float(y_match.group(1))
                        z = float(z_match.group(1))
                        return {"x": x, "y": y, "z": z}
                except (ValueError, AttributeError):
                    continue
                    
        return None
    except Exception as e:
        print(f"Error parsing vector data: {e}")
        return None

def fetch_horizons_data(body_id, body_name):
    """
    Fetch ephemeris data from JPL Horizons API for a specific celestial body
    """
    # Use a single timestamp (current UTC) for TLIST
    time_str = datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M')
    
    # Horizons API parameters (matching JS version)
    params = {
        'format': 'json',
        'COMMAND': f"'{body_id}'",
        'OBJ_DATA': 'NO',
        'MAKE_EPHEM': 'YES',
        'EPHEM_TYPE': 'VECTORS',
        'CENTER': "'500@10'",  # Heliocentric
        'REF_PLANE': 'ECLIPTIC',
        'OUT_UNITS': 'AU-D',
        'VEC_TABLE': '1',
        'TIME_TYPE': 'UT',
        'TLIST': f"'{time_str}'"
    }
    
    try:
        print(f"Fetching data for {body_name} (ID: {body_id})...")
        response = requests.get(HORIZONS_API_URL, params=params, timeout=30)
        response.raise_for_status()
        
        data = response.json()
        
        # Get the result text from the API response
        result_text = data.get("result", "")
        
        # Parse vector coordinates
        vector_data = parse_vector_data(result_text)
        
        if vector_data:
            return {
                "id": body_id,
                "name": body_name,
                "type": "planet",
                "x": vector_data["x"],
                "y": vector_data["y"],
                "z": vector_data["z"]
            }
        else:
            print(f"Could not parse vector data for {body_name}")
            return {
                "id": body_id,
                "name": body_name,
                "error": "Could not parse vector data"
            }
        
    except requests.exceptions.RequestException as e:
        print(f"Error fetching data for {body_name}: {e}")
        return {
            "id": body_id,
            "name": body_name,
            "error": str(e)
        }
    except Exception as e:
        print(f"Unexpected error for {body_name}: {e}")
        return {
            "id": body_id,
            "name": body_name,
            "error": str(e)
        }

# Remove the load_existing_data function since we're creating fresh data each time

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
    current_time = datetime.now(timezone.utc)
    print(f"Timestamp: {current_time.isoformat()}")
    
    # Initialize the output structure
    output_data = {
        "timestamp_utc": current_time.strftime('%Y-%b-%d %H:%M:%S'),
        "center": "Sun",
        "ref_plane": "ECLIPTIC", 
        "units": {
            "distance": "au"
        },
        "bodies": [],
        "failed": []
    }
    
    # Fetch data for each celestial body
    successful_updates = 0
    total_bodies = len(CELESTIAL_BODIES)
    
    for body_id, body_name in CELESTIAL_BODIES.items():
        body_data = fetch_horizons_data(body_id, body_name)
        
        if "error" in body_data:
            output_data["failed"].append(body_data)
        else:
            output_data["bodies"].append(body_data)
            successful_updates += 1
    
    # Save updated data
    if save_data(output_data):
        print(f"Update completed successfully! {successful_updates}/{total_bodies} bodies updated.")
        if output_data["failed"]:
            print(f"Failed to fetch data for {len(output_data['failed'])} bodies.")
        sys.exit(0)
    else:
        print("Failed to save data!")
        sys.exit(1)

if __name__ == "__main__":
    main()