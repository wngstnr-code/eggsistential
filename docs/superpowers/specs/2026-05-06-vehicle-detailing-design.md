# Vehicle Detailing Design

## Overview
Remove the motorcycle vehicle from the road set and enrich the bus and van models with lightweight geometry details so they look fuller without heavy performance cost.

## Goals
- Remove motorcycle from in-game road vehicle spawning.
- Add simple visual details to bus and van (mirrors, bumpers, striping, panel lines, roof elements).
- Keep low-poly style and preserve current performance.

## Non-goals
- No new textures or external assets.
- No changes to gameplay logic, collision, or spawn rates.
- No new vehicle types.

## Current State
Vehicle models are defined in the front-end game script. `RoadVehicle` routes to the appropriate constructor. `Van` and `Bus` are simple grouped meshes with minimal detail. `Motorcycle` exists as a lightweight vehicle.

## Proposed Changes
### Motorcycle removal
- Remove the `motorcycle` route from `RoadVehicle` and delete the `Motorcycle` constructor (and helper wheel) if unused.
- Ensure any random vehicle selection logic no longer references `motorcycle`.

### Van detailing
Add low-cost mesh elements to increase visual richness:
- Mirrors on both sides (small boxes).
- Front grille and bumper blocks.
- Side sliding door panel line (thin box).
- Roof light bar or small top panel.
- Optional side stripe accent (thin box) with a contrasting color.

### Bus detailing
Add low-cost mesh elements:
- Mirrors and wipers (small boxes on front).
- Thicker front/rear bumper blocks.
- Roof HVAC box (simple cuboid on roof).
- Door frame panel line and a small step accent.
- Side stripe accent and minor variation in window spacing.

### Color variation
- Use a small set of fixed accent colors for stripes or roof panels to add variety without altering base palette.

## Components and Touchpoints
- `frontend/public/script.js`: update `RoadVehicle`, remove motorcycle references, and enhance `Van`/`Bus` meshes.

## Risks and Mitigations
- Risk: extra meshes reduce FPS on low-end devices.
- Mitigation: only add simple box geometries and reuse materials when possible.

## Testing Plan
- Manual: run the game and verify that vans and buses appear with added details.
- Manual: confirm motorcycles no longer spawn.
- Visual: check for clipping or severe overlap at typical camera angles.
