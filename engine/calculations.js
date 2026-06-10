/**
 * CarbonWise AI — Core Footprint Calculations
 * ===========================================
 * Pure mathematical functions for estimating annual carbon emissions.
 * 
 * Rules enforced:
 *   1. Pure Functions Only: No DOM access, no localStorage, no side effects.
 *   2. Defensive Coding: Handles undefined, null, NaN, and negative values safely using utils.
 *   3. Individual Exports: Every function is exported independently for high testability.
 *   4. No Frameworks: Vanilla ES6 modules only.
 */

'use strict';

import {
  FUEL_EMISSION_FACTORS,
  DEFAULT_FUEL_EFFICIENCY_KM_PER_L,
  TRANSIT_EMISSION_FACTORS,
  FLIGHT_EMISSION_FACTORS,
  AVIATION_RFI_MULTIPLIER,
  GRID_EMISSION_FACTOR_KWH,
  GAS_EMISSION_FACTOR_KWH,
  DIET_EMISSION_FACTORS,
  FOOD_WASTE_MAX_PENALTY_PER_DAY,
  FOOD_WASTE_MAX_RATIO,
  WASTE_BASE_KG_PER_DAY,
  WASTE_EMISSION_FACTOR,
  RECYCLING_EMISSION_OFFSET_RATIO,
  ECO_SCORE_FLOOR_TONS,
  ECO_SCORE_CEILING_TONS,
  ECO_LEVELS,
  INPUT_BOUNDS
} from '../config/emissionFactors.js';

import { validateNumber, getEcoLevel } from './utils.js';

/**
 * Calculates annual transport emissions (vehicle, transit, and flights).
 * 
 * @param {Object} inputs - The raw user input object containing transport properties.
 * @returns {number} Transport footprint in kg CO2e / year.
 */
export function calculateTransportFootprint(inputs = {}) {
  // 1. Private Vehicle
  const carKm = validateNumber(inputs.carKm, INPUT_BOUNDS.carKm.min, INPUT_BOUNDS.carKm.max);
  // Prevent division by zero with fallback
  const fuelEfficiency = validateNumber(inputs.fuelEfficiency, INPUT_BOUNDS.fuelEfficiency.min, INPUT_BOUNDS.fuelEfficiency.max) || DEFAULT_FUEL_EFFICIENCY_KM_PER_L;
  const fuelType = inputs.fuelType && FUEL_EMISSION_FACTORS[inputs.fuelType] !== undefined ? inputs.fuelType : 'gasoline';
  
  const vehicleEmissions = (carKm / fuelEfficiency) * FUEL_EMISSION_FACTORS[fuelType];

  // 2. Public Transit
  const transitKm = validateNumber(inputs.transitKm, INPUT_BOUNDS.transitKm.min, INPUT_BOUNDS.transitKm.max);
  // Using bus factor as a generalized transit baseline per architecture
  const transitEmissions = transitKm * TRANSIT_EMISSION_FACTORS.bus;

  // 3. Aviation
  const flightHoursShort = validateNumber(inputs.flightHoursShort, INPUT_BOUNDS.flightHoursShort.min, INPUT_BOUNDS.flightHoursShort.max);
  const flightHoursLong = validateNumber(inputs.flightHoursLong, INPUT_BOUNDS.flightHoursLong.min, INPUT_BOUNDS.flightHoursLong.max);
  
  const flightEmissionsShort = flightHoursShort * FLIGHT_EMISSION_FACTORS.shortHaulPerHour * AVIATION_RFI_MULTIPLIER;
  const flightEmissionsLong = flightHoursLong * FLIGHT_EMISSION_FACTORS.longHaulPerHour * AVIATION_RFI_MULTIPLIER;

  return vehicleEmissions + transitEmissions + flightEmissionsShort + flightEmissionsLong;
}

/**
 * Calculates annual home energy emissions (electricity and gas).
 * Accounts for clean energy offsets dynamically.
 * 
 * @param {Object} inputs - The raw user input object containing energy properties.
 * @returns {number} Energy footprint in kg CO2e / year.
 */
export function calculateEnergyFootprint(inputs = {}) {
  const electricityKwh = validateNumber(inputs.electricityKwh, INPUT_BOUNDS.electricityKwh.min, INPUT_BOUNDS.electricityKwh.max);
  const gasKwh = validateNumber(inputs.gasKwh, INPUT_BOUNDS.gasKwh.min, INPUT_BOUNDS.gasKwh.max);
  const cleanEnergyOffset = validateNumber(inputs.cleanEnergyOffset, INPUT_BOUNDS.cleanEnergyOffset.min, INPUT_BOUNDS.cleanEnergyOffset.max);

  const cleanEnergyRatio = cleanEnergyOffset / 100;
  
  // Convert monthly usage to annual
  const annualElectricityKwh = electricityKwh * 12;
  const annualGasKwh = gasKwh * 12;

  const electricityEmissions = annualElectricityKwh * GRID_EMISSION_FACTOR_KWH * (1 - cleanEnergyRatio);
  const gasEmissions = annualGasKwh * GAS_EMISSION_FACTOR_KWH;

  return electricityEmissions + gasEmissions;
}

/**
 * Calculates annual diet-related emissions, including scalable food waste penalties.
 * 
 * @param {Object} inputs - The raw user input object containing dietary properties.
 * @returns {number} Diet footprint in kg CO2e / year.
 */
export function calculateDietFootprint(inputs = {}) {
  const dietType = inputs.dietType && DIET_EMISSION_FACTORS[inputs.dietType] !== undefined ? inputs.dietType : 'average-meat';
  const foodWaste = validateNumber(inputs.foodWaste, INPUT_BOUNDS.foodWaste.min, INPUT_BOUNDS.foodWaste.max);

  const baseDietDaily = DIET_EMISSION_FACTORS[dietType];
  
  const wasteRatio = foodWaste / 100;
  
  // Penalty scales linearly relative to the maximum expected waste ratio (50%)
  const penaltyScale = wasteRatio / FOOD_WASTE_MAX_RATIO;
  const wastePenaltyDaily = penaltyScale * FOOD_WASTE_MAX_PENALTY_PER_DAY;

  const totalDaily = baseDietDaily + wastePenaltyDaily;
  return totalDaily * 365;
}

/**
 * Calculates annual solid waste emissions, discounting avoided emissions from recycling.
 * 
 * @param {Object} inputs - The raw user input object containing waste properties.
 * @returns {number} Waste footprint in kg CO2e / year.
 */
export function calculateWasteFootprint(inputs = {}) {
  const recyclingRate = validateNumber(inputs.recyclingRate, INPUT_BOUNDS.recyclingRate.min, INPUT_BOUNDS.recyclingRate.max);
  const recyclingRatio = recyclingRate / 100;

  const recyclingOffset = WASTE_BASE_KG_PER_DAY * recyclingRatio * RECYCLING_EMISSION_OFFSET_RATIO;
  const netWasteDaily = WASTE_BASE_KG_PER_DAY - recyclingOffset;

  return netWasteDaily * WASTE_EMISSION_FACTOR * 365;
}

/**
 * Calculates the total annual carbon footprint and provides a categorized breakdown.
 * Returns a structured object to prevent floating point UI errors and ensure clear data mapping.
 * 
 * @param {Object} inputs - The raw user input object.
 * @returns {Object} Structured total footprint data.
 */
export function calculateTotalFootprint(inputs = {}) {
  const transport = calculateTransportFootprint(inputs);
  const energy = calculateEnergyFootprint(inputs);
  const diet = calculateDietFootprint(inputs);
  const waste = calculateWasteFootprint(inputs);

  const totalKg = transport + energy + diet + waste;
  
  return {
    totalKg: parseFloat(totalKg.toFixed(2)),
    totalTons: parseFloat((totalKg / 1000).toFixed(2)),
    breakdown: {
      transport: parseFloat(transport.toFixed(2)),
      energy: parseFloat(energy.toFixed(2)),
      diet: parseFloat(diet.toFixed(2)),
      waste: parseFloat(waste.toFixed(2))
    }
  };
}

/**
 * Calculates the Eco Score (0-100) and corresponding tier level based on total tons.
 * Uses a linear interpolation formula bounded by floor and ceiling constants.
 * 
 * @param {number} totalTons - The total annual footprint in metric tons.
 * @returns {Object} Structured Eco Score data containing score and level string.
 */
export function calculateEcoScore(totalTons) {
  // Validate to prevent NaN or negative injections
  const tons = validateNumber(totalTons, 0, 9999);
  
  let score = 0;
  if (tons <= ECO_SCORE_FLOOR_TONS) {
    score = 100;
  } else if (tons >= ECO_SCORE_CEILING_TONS) {
    score = 0;
  } else {
    // Linear interpolation between the floor and ceiling bounds
    const range = ECO_SCORE_CEILING_TONS - ECO_SCORE_FLOOR_TONS;
    const excess = tons - ECO_SCORE_FLOOR_TONS;
    score = Math.round(100 - (excess * (100 / range)));
  }

  // Final clamp to ensure score remains exactly between 0 and 100
  score = Math.max(0, Math.min(100, score));

  // Resolve named level from utils
  const levelObj = getEcoLevel(score, ECO_LEVELS);

  return {
    score: score,
    level: levelObj.label,
    cssClass: levelObj.cssClass // Included to aid UI rendering
  };
}
