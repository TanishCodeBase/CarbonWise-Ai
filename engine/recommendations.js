/**
 * CarbonWise AI — Recommendation Engine & Insight Generator
 * ===========================================================
 * Declarative rule database and compiler for personalized carbon reduction advice.
 *
 * Design rules enforced in this file:
 *   1. Pure Functions Only: No DOM access, no localStorage, no event listeners.
 *   2. No Side Effects: Every function receives inputs and returns a new value.
 *   3. Named Exports Only: No default exports, no classes.
 *   4. Rules are declarative data objects — logic lives in the compiler functions.
 *   5. Fully testable: each rule's condition() and calculateSavings() can be
 *      invoked independently in tests/test.js without any DOM setup.
 *
 * Rule Schema:
 *   id               {string}   Unique kebab-case identifier used for deduplication.
 *   category         {string}   'transport' | 'energy' | 'diet' | 'waste'
 *   title            {string}   Short action title shown in the UI card heading.
 *   description      {string}   Actionable detail explaining why and how to act.
 *   difficulty       {string}   'Easy' | 'Medium' | 'Hard'
 *   impact           {string}   'Low' | 'Medium' | 'High'  (qualitative label)
 *   condition        {Function} (inputs, footprintData) → boolean
 *                               Returns true when this rule is relevant to the user.
 *   calculateSavings {Function} (inputs, footprintData) → number  (kg CO₂e / year)
 *                               Estimates the annual saving if the action is fully adopted.
 */

'use strict';

import { validateNumber } from './utils.js';
import {
  INPUT_BOUNDS,
  FUEL_EMISSION_FACTORS,
  TRANSIT_EMISSION_FACTORS,
  DIET_EMISSION_FACTORS
} from '../config/emissionFactors.js';

// ─────────────────────────────────────────────────────────────────────────────
// INTERNAL CONSTANTS — Thresholds that trigger recommendations
// ─────────────────────────────────────────────────────────────────────────────

/** Annual driving distance (km) above which car-centric recommendations activate. */
const THRESHOLD_HIGH_CAR_KM      = 8_000;
const THRESHOLD_MODERATE_CAR_KM  = 4_000;

/** Annual flight hours above which aviation recommendations activate. */
const THRESHOLD_HIGH_FLIGHT_HRS  = 20;
const THRESHOLD_ANY_FLIGHT_HRS   = 5;

/** Monthly electricity (kWh) above which energy recommendations activate. */
const THRESHOLD_HIGH_ELEC_KWH    = 300;
const THRESHOLD_MODERATE_ELEC_KWH = 150;

/** Monthly gas (kWh) above which heating recommendations activate. */
const THRESHOLD_HIGH_GAS_KWH     = 200;

/** Recycling rate (%) below which waste recommendations activate. */
const THRESHOLD_LOW_RECYCLING     = 50;
const THRESHOLD_VERY_LOW_RECYCLING = 20;

/** Clean energy offset (%) below which renewable recommendations activate. */
const THRESHOLD_LOW_CLEAN_ENERGY  = 30;

// ─────────────────────────────────────────────────────────────────────────────
// RULE DATABASE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The complete declarative rule database.
 * Conditions and savings functions receive the validated `inputs` object
 * (from app.js state.inputs) and the `footprintData` result object
 * (from calculateTotalFootprint).
 *
 * @type {Array<{
 *   id: string, category: string, title: string, description: string,
 *   difficulty: string, impact: string,
 *   condition: Function, calculateSavings: Function
 * }>}
 */
export const RECOMMENDATION_RULES = [

  // ── TRANSPORT ──────────────────────────────────────────────────────────────

  {
    id: 'switch-to-public-transit',
    category: 'transport',
    title: 'Switch commute to public transit',
    description:
      'Replacing a solo car commute with bus or rail is one of the highest-impact ' +
      'single actions available. Even two days per week on transit meaningfully ' +
      'reduces fuel burn and congestion emissions.',
    difficulty: 'Medium',
    impact: 'High',
    /**
     * Activates when the user drives more than the high-car threshold and
     * does not already use significant transit.
     */
    condition(inputs) {
      const carKm   = validateNumber(inputs.carKm,    INPUT_BOUNDS.carKm.min,    INPUT_BOUNDS.carKm.max);
      const transit  = validateNumber(inputs.transitKm, INPUT_BOUNDS.transitKm.min, INPUT_BOUNDS.transitKm.max);
      return carKm > THRESHOLD_HIGH_CAR_KM && transit < carKm * 0.25;
    },
    /**
     * Models shifting 40% of annual driving to the bus network.
     * Saving = emissions avoided by not driving those km
     *        – emissions produced by riding the bus the same distance.
     */
    calculateSavings(inputs) {
      const carKm   = validateNumber(inputs.carKm,         INPUT_BOUNDS.carKm.min,         INPUT_BOUNDS.carKm.max);
      const eff     = validateNumber(inputs.fuelEfficiency, INPUT_BOUNDS.fuelEfficiency.min, INPUT_BOUNDS.fuelEfficiency.max) || 12;
      const fuel    = inputs.fuelType && FUEL_EMISSION_FACTORS[inputs.fuelType] !== undefined
                        ? inputs.fuelType : 'gasoline';
      const shiftKm = carKm * 0.40;
      const carEmissionsAvoided  = (shiftKm / eff) * FUEL_EMISSION_FACTORS[fuel];
      const transitEmissionsAdded = shiftKm * TRANSIT_EMISSION_FACTORS.bus;
      return Math.max(0, carEmissionsAvoided - transitEmissionsAdded);
    }
  },

  {
    id: 'reduce-weekly-driving',
    category: 'transport',
    title: 'Reduce driving by 20 km per week',
    description:
      'Combining errands, carpooling, or cycling for short trips instead of ' +
      'driving can trim roughly 20 km from your weekly distance — achievable ' +
      'without major lifestyle disruption.',
    difficulty: 'Easy',
    impact: 'Medium',
    condition(inputs) {
      const carKm = validateNumber(inputs.carKm, INPUT_BOUNDS.carKm.min, INPUT_BOUNDS.carKm.max);
      return carKm > THRESHOLD_MODERATE_CAR_KM;
    },
    /**
     * Saving = annual emission from 20 km × 52 weeks of avoided driving.
     */
    calculateSavings(inputs) {
      const eff  = validateNumber(inputs.fuelEfficiency, INPUT_BOUNDS.fuelEfficiency.min, INPUT_BOUNDS.fuelEfficiency.max) || 12;
      const fuel = inputs.fuelType && FUEL_EMISSION_FACTORS[inputs.fuelType] !== undefined
                     ? inputs.fuelType : 'gasoline';
      const annualKmSaved = 20 * 52;
      return (annualKmSaved / eff) * FUEL_EMISSION_FACTORS[fuel];
    }
  },

  {
    id: 'switch-to-electric-vehicle',
    category: 'transport',
    title: 'Transition to an electric vehicle',
    description:
      'Switching from a fossil-fuel car to an EV eliminates all direct tailpipe ' +
      'emissions. Upstream grid emissions are substantially lower and continue to ' +
      'improve as grids decarbonise.',
    difficulty: 'Hard',
    impact: 'High',
    condition(inputs) {
      const carKm  = validateNumber(inputs.carKm, INPUT_BOUNDS.carKm.min, INPUT_BOUNDS.carKm.max);
      const isEV   = inputs.fuelType === 'electric';
      return carKm > THRESHOLD_MODERATE_CAR_KM && !isEV;
    },
    /**
     * Saving ≈ the user's entire current vehicle emission (EV = 0 direct emissions).
     */
    calculateSavings(inputs) {
      const carKm = validateNumber(inputs.carKm,         INPUT_BOUNDS.carKm.min,         INPUT_BOUNDS.carKm.max);
      const eff   = validateNumber(inputs.fuelEfficiency, INPUT_BOUNDS.fuelEfficiency.min, INPUT_BOUNDS.fuelEfficiency.max) || 12;
      const fuel  = inputs.fuelType && FUEL_EMISSION_FACTORS[inputs.fuelType] !== undefined
                      ? inputs.fuelType : 'gasoline';
      return (carKm / eff) * FUEL_EMISSION_FACTORS[fuel];
    }
  },

  {
    id: 'reduce-short-haul-flights',
    category: 'transport',
    title: 'Replace short-haul flights with rail travel',
    description:
      'Short flights (under 3 hours) are the least fuel-efficient way to travel. ' +
      'Replacing even one return short-haul flight with train travel can eliminate ' +
      'hundreds of kilograms of aviation emissions including radiative forcing effects.',
    difficulty: 'Medium',
    impact: 'High',
    condition(inputs) {
      const sh = validateNumber(inputs.flightHoursShort, INPUT_BOUNDS.flightHoursShort.min, INPUT_BOUNDS.flightHoursShort.max);
      return sh > THRESHOLD_ANY_FLIGHT_HRS;
    },
    /**
     * Models eliminating 30% of short-haul flight hours (RFI-adjusted).
     */
    calculateSavings(inputs) {
      const sh = validateNumber(inputs.flightHoursShort, INPUT_BOUNDS.flightHoursShort.min, INPUT_BOUNDS.flightHoursShort.max);
      // Import factors inline to keep function self-contained
      return sh * 0.30 * 150 * 1.9;
    }
  },

  {
    id: 'reduce-long-haul-flights',
    category: 'transport',
    title: 'Reduce long-haul flights by one per year',
    description:
      'Long-haul flights are a carbon-intensive activity. Eliminating a single ' +
      'return long-haul trip can save over a ton of CO₂e once radiative forcing ' +
      'is factored in — often more than months of driving.',
    difficulty: 'Hard',
    impact: 'High',
    condition(inputs) {
      const lh = validateNumber(inputs.flightHoursLong, INPUT_BOUNDS.flightHoursLong.min, INPUT_BOUNDS.flightHoursLong.max);
      return lh > THRESHOLD_HIGH_FLIGHT_HRS;
    },
    /**
     * Models saving one return long-haul flight (~10 hours round trip).
     */
    calculateSavings() {
      return 10 * 110 * 1.9; // 10 hrs × 110 kg/hr × RFI
    }
  },

  // ── ENERGY ─────────────────────────────────────────────────────────────────

  {
    id: 'switch-to-renewable-tariff',
    category: 'energy',
    title: 'Switch to a 100% renewable electricity tariff',
    description:
      'Many energy suppliers offer tariffs backed by renewable generation certificates. ' +
      'Switching eliminates the grid emission factor from your electricity bill ' +
      'with zero hardware or lifestyle change required.',
    difficulty: 'Easy',
    impact: 'High',
    condition(inputs) {
      const kwh    = validateNumber(inputs.electricityKwh,    INPUT_BOUNDS.electricityKwh.min,    INPUT_BOUNDS.electricityKwh.max);
      const offset = validateNumber(inputs.cleanEnergyOffset, INPUT_BOUNDS.cleanEnergyOffset.min, INPUT_BOUNDS.cleanEnergyOffset.max);
      return kwh > THRESHOLD_MODERATE_ELEC_KWH && offset < THRESHOLD_LOW_CLEAN_ENERGY;
    },
    /**
     * Saving = annual electricity emissions that would be eliminated by moving
     * from the user's current clean energy ratio to 100%.
     */
    calculateSavings(inputs) {
      const kwh    = validateNumber(inputs.electricityKwh,    INPUT_BOUNDS.electricityKwh.min,    INPUT_BOUNDS.electricityKwh.max);
      const offset = validateNumber(inputs.cleanEnergyOffset, INPUT_BOUNDS.cleanEnergyOffset.min, INPUT_BOUNDS.cleanEnergyOffset.max);
      const currentRatio   = offset / 100;
      const annualKwh      = kwh * 12;
      // Saving = difference between current grid mix and 100% clean
      return annualKwh * 0.38 * (1 - currentRatio);
    }
  },

  {
    id: 'install-led-efficient-appliances',
    category: 'energy',
    title: 'Replace inefficient appliances with A+++ rated models',
    description:
      'Upgrading to highly efficient LED lighting and A+++ rated appliances ' +
      '(refrigerator, washing machine, dishwasher) typically reduces household ' +
      'electricity consumption by 20–30% without any behavioural change.',
    difficulty: 'Hard',
    impact: 'High',
    condition(inputs) {
      const kwh    = validateNumber(inputs.electricityKwh,    INPUT_BOUNDS.electricityKwh.min,    INPUT_BOUNDS.electricityKwh.max);
      const offset = validateNumber(inputs.cleanEnergyOffset, INPUT_BOUNDS.cleanEnergyOffset.min, INPUT_BOUNDS.cleanEnergyOffset.max);
      // Only recommend if grid emission intensity remains meaningful
      return kwh > THRESHOLD_HIGH_ELEC_KWH && offset < 80;
    },
    /**
     * Models a 25% reduction in electricity consumption.
     */
    calculateSavings(inputs) {
      const kwh    = validateNumber(inputs.electricityKwh,    INPUT_BOUNDS.electricityKwh.min,    INPUT_BOUNDS.electricityKwh.max);
      const offset = validateNumber(inputs.cleanEnergyOffset, INPUT_BOUNDS.cleanEnergyOffset.min, INPUT_BOUNDS.cleanEnergyOffset.max);
      const annualKwh    = kwh * 12;
      const cleanRatio   = offset / 100;
      const reducedKwh   = annualKwh * 0.25;
      return reducedKwh * 0.38 * (1 - cleanRatio);
    }
  },

  {
    id: 'reduce-standby-energy',
    category: 'energy',
    title: 'Eliminate standby power consumption',
    description:
      'Devices left in standby mode ("vampire load") can account for 5–10% of ' +
      'household electricity. Using smart power strips and switching off devices ' +
      'at the plug is a low-effort, zero-cost action.',
    difficulty: 'Easy',
    impact: 'Low',
    condition(inputs) {
      const kwh = validateNumber(inputs.electricityKwh, INPUT_BOUNDS.electricityKwh.min, INPUT_BOUNDS.electricityKwh.max);
      return kwh > THRESHOLD_MODERATE_ELEC_KWH;
    },
    /**
     * Models a 7% reduction from standby elimination.
     */
    calculateSavings(inputs) {
      const kwh    = validateNumber(inputs.electricityKwh,    INPUT_BOUNDS.electricityKwh.min,    INPUT_BOUNDS.electricityKwh.max);
      const offset = validateNumber(inputs.cleanEnergyOffset, INPUT_BOUNDS.cleanEnergyOffset.min, INPUT_BOUNDS.cleanEnergyOffset.max);
      const annualKwh  = kwh * 12;
      const cleanRatio = offset / 100;
      return annualKwh * 0.07 * 0.38 * (1 - cleanRatio);
    }
  },

  {
    id: 'improve-home-insulation',
    category: 'energy',
    title: 'Improve home insulation to reduce gas heating demand',
    description:
      'Roof insulation, double glazing, and draught-proofing can reduce heating ' +
      'energy demand by 20–40%. This directly cuts natural gas consumption and ' +
      'the associated CO₂e emissions year-round.',
    difficulty: 'Hard',
    impact: 'High',
    condition(inputs) {
      const gas = validateNumber(inputs.gasKwh, INPUT_BOUNDS.gasKwh.min, INPUT_BOUNDS.gasKwh.max);
      return gas > THRESHOLD_HIGH_GAS_KWH;
    },
    /**
     * Models a 30% reduction in natural gas usage.
     */
    calculateSavings(inputs) {
      const gas = validateNumber(inputs.gasKwh, INPUT_BOUNDS.gasKwh.min, INPUT_BOUNDS.gasKwh.max);
      return gas * 12 * 0.185 * 0.30;
    }
  },

  // ── DIET ───────────────────────────────────────────────────────────────────

  {
    id: 'introduce-meat-free-days',
    category: 'diet',
    title: 'Introduce 2 meat-free days per week',
    description:
      'Replacing meat with plant-based meals on just two days each week reduces ' +
      'your effective diet footprint proportionally. Legumes, tofu, and whole ' +
      'grains have a fraction of the land-use and methane impact of beef and lamb.',
    difficulty: 'Easy',
    impact: 'High',
    condition(inputs) {
      return inputs.dietType === 'heavy-meat' || inputs.dietType === 'average-meat';
    },
    /**
     * Models 2/7 days shifting from the user's current diet to a vegetarian baseline.
     * Saving = (current daily factor – vegetarian daily factor) × 2 days × 52 weeks.
     */
    calculateSavings(inputs) {
      const diet = inputs.dietType && DIET_EMISSION_FACTORS[inputs.dietType] !== undefined ? inputs.dietType : 'average-meat';
      const currentDaily     = DIET_EMISSION_FACTORS[diet];
      const vegetarianDaily  = DIET_EMISSION_FACTORS['vegetarian'];
      return Math.max(0, (currentDaily - vegetarianDaily) * 2 * 52);
    }
  },

  {
    id: 'shift-to-vegetarian-diet',
    category: 'diet',
    title: 'Transition to a vegetarian diet',
    description:
      'A fully vegetarian diet (retaining dairy and eggs) produces roughly 40% ' +
      'less CO₂e than an average meat-eating diet. This is one of the most ' +
      'impactful personal choices available for reducing food-related emissions.',
    difficulty: 'Medium',
    impact: 'High',
    condition(inputs) {
      return inputs.dietType === 'heavy-meat' || inputs.dietType === 'average-meat' || inputs.dietType === 'pescatarian';
    },
    /**
     * Models full adoption of a vegetarian diet for 365 days.
     */
    calculateSavings(inputs) {
      const diet = inputs.dietType && DIET_EMISSION_FACTORS[inputs.dietType] !== undefined ? inputs.dietType : 'average-meat';
      return Math.max(0, (DIET_EMISSION_FACTORS[diet] - DIET_EMISSION_FACTORS['vegetarian']) * 365);
    }
  },

  {
    id: 'reduce-food-waste',
    category: 'diet',
    title: 'Reduce household food waste by half',
    description:
      'Food that is wasted carries the full carbon cost of its production, ' +
      'transport, and disposal. Meal planning, correct portion sizing, and ' +
      'using leftovers can halve food waste with minimal effort.',
    difficulty: 'Easy',
    impact: 'Medium',
    condition(inputs) {
      const waste = validateNumber(inputs.foodWaste, INPUT_BOUNDS.foodWaste.min, INPUT_BOUNDS.foodWaste.max);
      return waste > 10;
    },
    /**
     * Models halving the food waste ratio and recalculating the penalty reduction.
     */
    calculateSavings(inputs) {
      const foodWaste = validateNumber(inputs.foodWaste, INPUT_BOUNDS.foodWaste.min, INPUT_BOUNDS.foodWaste.max);
      const currentRatio = foodWaste / 100;
      const halvedRatio  = currentRatio / 2;
      // Max penalty at 50% waste = 0.8 kg/day; scale linearly.
      const currentPenalty = (currentRatio / 0.5) * 0.8 * 365;
      const reducedPenalty = (halvedRatio  / 0.5) * 0.8 * 365;
      return Math.max(0, currentPenalty - reducedPenalty);
    }
  },

  {
    id: 'shift-to-plant-based-proteins',
    category: 'diet',
    title: 'Replace red meat with plant-based proteins',
    description:
      'Beef and lamb produce 10–20× more CO₂e per gram of protein than pulses ' +
      'and legumes. Swapping red meat for lentils, beans, or tofu even a few ' +
      'times per week delivers significant measurable savings.',
    difficulty: 'Easy',
    impact: 'High',
    condition(inputs) {
      return inputs.dietType === 'heavy-meat';
    },
    /**
     * Models moving from heavy-meat to average-meat consumption patterns.
     */
    calculateSavings() {
      // Uses imported DIET_EMISSION_FACTORS to avoid duplication with emissionFactors.js
      return (DIET_EMISSION_FACTORS['heavy-meat'] - DIET_EMISSION_FACTORS['average-meat']) * 365;
    }
  },

  // ── WASTE ──────────────────────────────────────────────────────────────────

  {
    id: 'improve-recycling-habits',
    category: 'waste',
    title: 'Improve household recycling to 70%',
    description:
      'Correctly sorting paper, cardboard, plastics, glass, and metals prevents ' +
      'them from entering landfill where they generate methane during decomposition. ' +
      'Most local authorities provide free recycling collection services.',
    difficulty: 'Easy',
    impact: 'Medium',
    condition(inputs) {
      const recycling = validateNumber(inputs.recyclingRate, INPUT_BOUNDS.recyclingRate.min, INPUT_BOUNDS.recyclingRate.max);
      return recycling < THRESHOLD_LOW_RECYCLING;
    },
    /**
     * Models increasing recycling to 70% and calculating the avoided landfill emissions.
     * Saving = difference between current and 70% recycling offset × emission factor × 365.
     */
    calculateSavings(inputs) {
      const recycling = validateNumber(inputs.recyclingRate, INPUT_BOUNDS.recyclingRate.min, INPUT_BOUNDS.recyclingRate.max);
      const currentRatio = recycling / 100;
      const targetRatio  = 0.70;
      if (currentRatio >= targetRatio) return 0;
      const currentOffset = 1.2 * currentRatio * 0.70;
      const targetOffset  = 1.2 * targetRatio  * 0.70;
      return (targetOffset - currentOffset) * 0.5 * 365;
    }
  },

  {
    id: 'start-composting',
    category: 'waste',
    title: 'Start composting organic kitchen waste',
    description:
      'Composting food scraps and garden waste diverts organic material from ' +
      'landfill, preventing the production of methane — a potent greenhouse gas. ' +
      'It also creates a free soil conditioner, closing the nutrient loop.',
    difficulty: 'Easy',
    impact: 'Medium',
    condition(inputs) {
      const recycling = validateNumber(inputs.recyclingRate, INPUT_BOUNDS.recyclingRate.min, INPUT_BOUNDS.recyclingRate.max);
      return recycling < THRESHOLD_LOW_RECYCLING;
    },
    /**
     * Models diverting an additional 15% of total waste via composting.
     */
    calculateSavings() {
      // 15% of 1.2 kg/day composted × emission factor × 365 days
      return 1.2 * 0.15 * 0.5 * 365;
    }
  },

  {
    id: 'adopt-zero-waste-purchasing',
    category: 'waste',
    title: 'Adopt low-packaging and bulk purchasing habits',
    description:
      'Choosing products with minimal or recyclable packaging, buying in bulk, ' +
      'and using reusable bags, containers, and bottles reduces the volume of ' +
      'waste generated at the source — the most effective waste intervention.',
    difficulty: 'Medium',
    impact: 'Medium',
    condition(inputs) {
      const recycling = validateNumber(inputs.recyclingRate, INPUT_BOUNDS.recyclingRate.min, INPUT_BOUNDS.recyclingRate.max);
      return recycling < 80;
    },
    /**
     * Models reducing total waste generation by 20%.
     */
    calculateSavings(inputs) {
      const recycling = validateNumber(inputs.recyclingRate, INPUT_BOUNDS.recyclingRate.min, INPUT_BOUNDS.recyclingRate.max);
      const recyclingRatio  = recycling / 100;
      const wasteReduction  = 1.2 * 0.20;  // 20% less waste generated
      const netSaving       = wasteReduction * (1 - recyclingRatio * 0.70) * 0.5 * 365;
      return Math.max(0, netSaving);
    }
  },

  {
    id: 'achieve-full-recycling',
    category: 'waste',
    title: 'Target near-zero landfill waste',
    description:
      'Combining composting, rigorous recycling, and minimal-waste purchasing ' +
      'can reduce landfill output to near zero. Households achieving this often ' +
      'produce less than one small bin bag of residual waste per month.',
    difficulty: 'Hard',
    impact: 'High',
    condition(inputs) {
      const recycling = validateNumber(inputs.recyclingRate, INPUT_BOUNDS.recyclingRate.min, INPUT_BOUNDS.recyclingRate.max);
      return recycling < THRESHOLD_VERY_LOW_RECYCLING;
    },
    /**
     * Models moving from the user's current rate to 95% recycling.
     */
    calculateSavings(inputs) {
      const recycling = validateNumber(inputs.recyclingRate, INPUT_BOUNDS.recyclingRate.min, INPUT_BOUNDS.recyclingRate.max);
      const currentRatio = recycling / 100;
      const targetRatio  = 0.95;
      if (currentRatio >= targetRatio) return 0;
      const currentOffset = 1.2 * currentRatio * 0.70;
      const targetOffset  = 1.2 * targetRatio  * 0.70;
      return Math.max(0, (targetOffset - currentOffset) * 0.5 * 365);
    }
  }
];

// ─────────────────────────────────────────────────────────────────────────────
// DIFFICULTY WEIGHT MAP (used by the actionability sorter)
// ─────────────────────────────────────────────────────────────────────────────

/** Maps difficulty labels to numeric weights. Lower weight = easier to act on. */
const DIFFICULTY_WEIGHT = { Easy: 1, Medium: 2, Hard: 4 };

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC API — generateRecommendations
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Evaluates the rule database against the user's inputs and footprint data,
 * filters out irrelevant rules, computes personalised savings, and returns
 * a sorted list of actionable recommendations.
 *
 * Sorting: recommendations are ordered by descending `actionabilityIndex`,
 * defined as `estimatedSavingsKg / difficultyWeight`. This surfaces actions
 * that offer the best return for the least behavioural effort.
 *
 * @param {Object} inputs        - The application state.inputs object.
 * @param {Object} footprintData - The object returned by calculateTotalFootprint().
 * @returns {Array<{
 *   id: string,
 *   category: string,
 *   title: string,
 *   description: string,
 *   estimatedSavingsKg: number,
 *   impact: string,
 *   difficulty: string,
 *   actionabilityIndex: number
 * }>} Filtered, computed, and sorted recommendation list.
 */
export function generateRecommendations(inputs = {}, footprintData = {}) {
  const results = [];

  for (const rule of RECOMMENDATION_RULES) {
    // 1. Guard: skip if condition is not met for this user's profile.
    let conditionMet = false;
    try {
      conditionMet = rule.condition(inputs, footprintData);
    } catch {
      // A malformed condition should never crash the app; silently skip.
      conditionMet = false;
    }
    if (!conditionMet) continue;

    // 2. Compute personalised savings for this user.
    let savingsKg = 0;
    try {
      savingsKg = rule.calculateSavings(inputs, footprintData);
    } catch {
      savingsKg = 0;
    }
    savingsKg = Math.max(0, parseFloat(savingsKg.toFixed(2)) || 0);

    // 3. Compute the actionability index for sorting.
    const diffWeight        = DIFFICULTY_WEIGHT[rule.difficulty] ?? 2;
    const actionabilityIndex = savingsKg / diffWeight;

    results.push({
      id:                  rule.id,
      category:            rule.category,
      title:               rule.title,
      description:         rule.description,
      estimatedSavingsKg:  savingsKg,
      impact:              rule.impact,
      difficulty:          rule.difficulty,
      actionabilityIndex:  parseFloat(actionabilityIndex.toFixed(2))
    });
  }

  // 4. Sort by highest actionability index (best effort-to-impact ratio first).
  results.sort((a, b) => b.actionabilityIndex - a.actionabilityIndex);

  return results;
}

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC API — generateCarbonInsight
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Identifies the user's largest emission contributor and generates a
 * personalised, plain-language insight including an estimated saving and
 * a priority action drawn from the recommendation engine.
 *
 * @param {Object}      inputs              - The application state.inputs object.
 * @param {Object}      footprintData       - The object returned by calculateTotalFootprint().
 * @param {Array|null}  [existingRecommendations=null] - Pre-computed recommendations from
 *   generateRecommendations(). When supplied, the rule database is NOT re-evaluated,
 *   eliminating the duplicate scan that previously occurred on every dashboard update.
 * @returns {{
 *   contributor:    string,
 *   percentage:     number,
 *   insight:        string,
 *   priorityAction: string
 * }}
 */
export function generateCarbonInsight(inputs = {}, footprintData = {}, existingRecommendations = null) {
  // Guard against empty or missing footprint data.
  const breakdown = footprintData.breakdown ?? { transport: 0, energy: 0, diet: 0, waste: 0 };
  const totalKg   = footprintData.totalKg ?? 0;

  // Friendly display names for each category key.
  const CATEGORY_LABELS = {
    transport: 'Transportation',
    energy:    'Home Energy',
    diet:      'Diet',
    waste:     'Waste & Recycling'
  };

  // 1. Identify the largest contributing category.
  let largestCategory = 'transport';
  let largestKg       = 0;

  for (const [cat, kg] of Object.entries(breakdown)) {
    if (kg > largestKg) {
      largestKg       = kg;
      largestCategory = cat;
    }
  }

  // 2. Calculate the percentage share.
  const percentage = totalKg > 0
    ? Math.round((largestKg / totalKg) * 100)
    : 0;

  const categoryLabel = CATEGORY_LABELS[largestCategory] ?? largestCategory;

  // 3. Find the highest-actionability recommendation in that category.
  // Re-use pre-computed recommendations if provided (eliminates duplicate rule scan).
  const recommendations = Array.isArray(existingRecommendations)
    ? existingRecommendations
    : generateRecommendations(inputs, footprintData);
  const topInCategory   = recommendations.find(r => r.category === largestCategory);

  const priorityAction  = topInCategory ? topInCategory.title : 'Review your habits in this category.';
  const estimatedSaving = topInCategory ? Math.round(topInCategory.estimatedSavingsKg) : 0;

  // 4. Build the natural-language insight string.
  let insight = '';
  if (totalKg === 0) {
    insight = 'Fill in your lifestyle details to receive a personalised carbon insight.';
  } else if (estimatedSaving > 0) {
    insight =
      `${categoryLabel} contributes ${percentage}% of your footprint. ` +
      `${topInCategory.description.split('.')[0]}. ` +
      `Acting on this could save approximately ${estimatedSaving.toLocaleString()} kg CO₂e annually. ` +
      `Priority Action: ${priorityAction}.`;
  } else {
    insight =
      `${categoryLabel} contributes ${percentage}% of your footprint. ` +
      `Consider reviewing your habits in this area to identify reduction opportunities. ` +
      `Priority Action: ${priorityAction}.`;
  }

  return {
    contributor:    `${categoryLabel} (${percentage}%)`,
    percentage:     percentage,
    insight:        insight,
    priorityAction: priorityAction
  };
}
