# Taxi Vehicle Design

## Overview
Add a new taxi sedan vehicle type to the road traffic. The taxi reuses the existing sedan proportions, uses a fixed yellow body color, and adds a small roof lightbox that reads "TAXI". Taxi spawns should appear at a 1-in-6 rate in the city lane profile.

## Goals
- Introduce a taxi vehicle type with a recognizable silhouette.
- Maintain low-poly style and minimal performance impact.
- Spawn taxi at a predictable 1/6 rate in the city lane profile.

## Non-goals
- No gameplay changes (speed, collisions, stakes).
- No external textures or new asset pipeline.
- No changes to other lane profiles unless required for compatibility.

## Proposed Changes
### Vehicle definition
- Add a new `Taxi` constructor modeled after the existing car sedan proportions.
- Use a fixed yellow body color and dark trim.
- Add a small roof lightbox mesh with "TAXI" text or implied text using a bright material.

### Spawning logic
- Route `kind === "taxi"` in `RoadVehicle`.
- Update the city lane vehicle kinds to include exactly one taxi out of six kinds, e.g. `["car", "car", "taxi", "car", "van", "car"]`.

### Color rules
- Taxi uses a fixed yellow body color (no random palette) to preserve recognition.

## Touchpoints
- `frontend/public/script.js`: add `Taxi`, update `RoadVehicle`, update city lane kinds, adjust `getVehicleColor` for taxi if needed.

## Risks and Mitigations
- Risk: taxi looks too similar to car.
- Mitigation: add roof lightbox and high-contrast yellow body with dark trim.

## Testing Plan
- Manual: run the game and confirm taxi appears in city lanes at the expected frequency.
- Visual: check roof lightbox placement and text visibility.
