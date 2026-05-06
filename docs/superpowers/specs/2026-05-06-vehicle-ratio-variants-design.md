# Vehicle Ratio + Variants Design

## Overview
Introduce new vehicle variants (police, ambulance, coupe) and rebalance spawn ratios so trucks appear more frequently while police/ambulance remain rare. Keep all models low-poly and consistent with existing car proportions.

## Goals
- Increase truck frequency overall.
- Add new vehicle types: police, ambulance, coupe.
- Keep police/ambulance rare relative to other vehicles.
- Preserve performance with simple geometry.

## Non-goals
- No gameplay changes, collision changes, or speed logic changes.
- No external textures or asset pipeline changes.

## Proposed Lane Ratios (per lane profile)
- City: 6 vehicles → car, car, taxi, coupe, truck, service
- Heavy: 2 vehicles → truck, truck
- Fast: 4 vehicles → car, car, coupe, truck
- Service: 3 vehicles → service, car, police
- Mixed: 4 vehicles → car, taxi, truck, ambulance

## Vehicle Definitions
### Police (sedan)
- Base: reuse sedan proportions.
- Visuals: black/white body, blue side stripe, roof lightbar with red/blue blocks.

### Ambulance (sedan)
- Base: reuse sedan proportions.
- Visuals: white body, red side stripe, roof lightbar with red blocks.

### Coupe (sedan variant)
- Base: shorter body and lower roof vs standard sedan.
- Visuals: regular random color palette.

## Touchpoints
- `frontend/public/script.js`: add constructors for `PoliceCar`, `Ambulance`, `Coupe`.
- Update `RoadVehicle` routing and `getVehicleColor`.
- Update lane `kinds` arrays to match target ratios.

## Risks and Mitigations
- Risk: too many new types reduce readability.
- Mitigation: keep strong visual cues (lightbar and clear stripes) and low spawn rates for police/ambulance.

## Testing Plan
- Manual: verify spawn ratios per lane profile.
- Visual: verify lightbars and stripes for police/ambulance.
- Visual: confirm coupe silhouette is distinct but cohesive.
