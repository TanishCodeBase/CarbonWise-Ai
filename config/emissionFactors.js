/**
 * CarbonWise AI — Emission Factors Configuration
 * ================================================
 * Centralized registry of carbon emission coefficients.
 *
 * Sources:
 *   - UK Defra Greenhouse Gas Reporting (2023 Conversion Factors)
 *   - US EPA Emission Factors for Greenhouse Gas Inventories
 *   - IPCC AR6 Radiative Forcing guidance for aviation
 *   - IEA World Energy Outlook (grid electricity intensities)
 *
 * Units: All factors produce kg CO₂e (CO₂ equivalent) per unit stated.
 * To update a factor, change the value here only — calculations.js will
 * automatically use the new coefficient without any further edits.
 */

'use strict';

// ----------------------------------------------------
// TRANSPORT — Private Vehicle
// ----------------------------------------------------
// Fuel combustion emission factors in kg CO₂ per litre of fuel burned.
// Electric vehicles produce zero direct tailpipe emissions; their
// upstream grid emissions are accounted for in the ELECTRICITY section.
export const FUEL_EMISSION_FACTORS = {
  gasoline: 2.31,  // kg CO₂ / litre  (Defra 2023, motor gasoline)
  diesel:   2.68,  // kg CO₂ / litre  (Defra 2023, diesel)
  hybrid:   1.15,  // kg CO₂ / litre  (~50% blend efficiency relative to gasoline)
  electric: 0.00   // kg CO₂ / litre  (zero direct emissions; see grid factor)
};

// Default assumed fuel efficiency when the user has not entered a value.
// 12 km/L approximates a typical mid-size passenger car worldwide.
export const DEFAULT_FUEL_EFFICIENCY_KM_PER_L = 12;

// ----------------------------------------------------
// TRANSPORT — Public Transit
// ----------------------------------------------------
// Emission factors per passenger-kilometre for shared transport modes.
// These are average figures that account for typical occupancy rates.
export const TRANSIT_EMISSION_FACTORS = {
  bus:    0.089,  // kg CO₂e / km  (Defra 2023, average local bus)
  train:  0.041   // kg CO₂e / km  (Defra 2023, national rail average)
};

// ----------------------------------------------------
// TRANSPORT — Aviation
// ----------------------------------------------------
// Base emission rates per flight hour by haul type.
// Short-haul flights (<3 hrs) burn proportionally more fuel per km
// due to the energy-intensive climb phase.
export const FLIGHT_EMISSION_FACTORS = {
  shortHaulPerHour: 150,  // kg CO₂ / hour  (average short-haul aircraft)
  longHaulPerHour:  110   // kg CO₂ / hour  (average long-haul aircraft)
};

// Radiative Forcing Index (RFI) multiplier for aviation.
// Aircraft emit water vapour, NOx, and contrails at altitude, which
// exert a warming effect roughly 1.9× greater than CO₂ alone.
// Source: IPCC AR6, Chapter 7; Lee et al. (2021) Atmospheric Environment.
export const AVIATION_RFI_MULTIPLIER = 1.9;

// Flight hour thresholds used to classify short vs. long haul.
export const FLIGHT_SHORT_HAUL_MAX_HOURS = 3;  // flights ≤ 3 hrs = short-haul

// ----------------------------------------------------
// ELECTRICITY — Grid Emission Intensity
// ----------------------------------------------------
// Global average grid emission factor for electricity generation.
// This assumes a typical national grid energy mix.
// Users can offset this via their renewable energy tariff percentage.
export const GRID_EMISSION_FACTOR_KWH = 0.38;  // kg CO₂e / kWh  (IEA 2023 world average)

// ----------------------------------------------------
// NATURAL GAS — Home Heating
// ----------------------------------------------------
// Emission factor for natural gas combustion used in boilers and cookers.
export const GAS_EMISSION_FACTOR_KWH = 0.185;  // kg CO₂e / kWh  (Defra 2023, natural gas)

// ----------------------------------------------------
// DIET — Daily Per-Capita Food Footprint
// ----------------------------------------------------
// Daily carbon footprint in kg CO₂e per person, by primary dietary pattern.
// These are evidence-weighted averages drawn from lifecycle analysis studies.
// Multiply by 365 to obtain an annual figure.
//
// Source: Poore & Nemecek (2018) "Reducing food's environmental impacts",
//         Science, Vol. 360, pp. 987–992.
export const DIET_EMISSION_FACTORS = {
  'heavy-meat':   3.3,  // kg CO₂e / day  (meat in most meals, >100g/day)
  'average-meat': 2.5,  // kg CO₂e / day  (mixed omnivore, ~50–100g meat/day)
  'pescatarian':  1.8,  // kg CO₂e / day  (fish + plant-based, minimal land meat)
  'vegetarian':   1.5,  // kg CO₂e / day  (dairy + eggs, no meat or fish)
  'vegan':        1.1   // kg CO₂e / day  (wholly plant-based diet)
};

// Maximum additional daily penalty applied when a user wastes 50% of food.
// Scaled linearly: a user who wastes 25% of food incurs 50% of this penalty.
export const FOOD_WASTE_MAX_PENALTY_PER_DAY = 0.8;  // kg CO₂e / day

// Maximum food waste ratio the input form accepts (50%).
export const FOOD_WASTE_MAX_RATIO = 0.5;

// ----------------------------------------------------
// WASTE & RECYCLING — Solid Waste
// ----------------------------------------------------
// Average daily household waste generated per person (before recycling).
export const WASTE_BASE_KG_PER_DAY = 1.2;  // kg / day  (OECD municipal solid waste average)

// Emission factor for landfilled solid waste (decomposition → CH₄ + CO₂).
export const WASTE_EMISSION_FACTOR = 0.5;  // kg CO₂e / kg waste  (Defra 2023, mixed solid waste)

// Fraction of net emissions avoided when recyclable material is properly sorted.
// Recycling paper, plastics, metals, and glass displaces ~70% of the emissions
// that would otherwise arise from virgin material production.
export const RECYCLING_EMISSION_OFFSET_RATIO = 0.70;

// ----------------------------------------------------
// ECO SCORE THRESHOLDS
// ----------------------------------------------------
// Total annual footprint (in metric tons CO₂e) that maps to a score of 100.
// Below this floor, the user is considered carbon-minimal.
export const ECO_SCORE_FLOOR_TONS = 2.0;   // ≤ 2.0 t/yr → score 100

// Total annual footprint (in metric tons CO₂e) that maps to a score of 0.
export const ECO_SCORE_CEILING_TONS = 15.0; // ≥ 15.0 t/yr → score 0

// Named level thresholds (score ranges map to descriptive titles).
export const ECO_LEVELS = [
  { minScore: 90, maxScore: 100, label: 'Carbon Guardian',  cssClass: 'level-guardian'   },
  { minScore: 75, maxScore: 89,  label: 'Eco Champion',     cssClass: 'level-champion'   },
  { minScore: 60, maxScore: 74,  label: 'Green Explorer',   cssClass: 'level-explorer'   },
  { minScore: 40, maxScore: 59,  label: 'Climate Learner',  cssClass: 'level-learner'    },
  { minScore: 0,  maxScore: 39,  label: 'High Impact User', cssClass: 'level-highimpact' }
];

// ----------------------------------------------------
// INPUT VALIDATION BOUNDS
// ----------------------------------------------------
// Hard limits used by validateNumber() to clamp unrealistic user values.
// These prevent both accidental typos and deliberate injection of extreme data.
export const INPUT_BOUNDS = {
  carKm:             { min: 0, max: 200_000 }, // km / year
  fuelEfficiency:    { min: 1, max: 100 },      // km / L  (min 1 avoids ÷ 0)
  transitKm:         { min: 0, max: 100_000 },  // km / year
  flightHoursShort:  { min: 0, max: 500 },      // hours / year
  flightHoursLong:   { min: 0, max: 500 },      // hours / year
  electricityKwh:    { min: 0, max: 10_000 },   // kWh / month
  gasKwh:            { min: 0, max: 10_000 },   // kWh / month
  cleanEnergyOffset: { min: 0, max: 100 },      // percentage (0–100)
  foodWaste:         { min: 0, max: 50 },        // percentage (0–50)
  recyclingRate:     { min: 0, max: 100 }        // percentage (0–100)
};
