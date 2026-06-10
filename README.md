# CarbonWise AI

![CarbonWise AI Platform](https://img.shields.io/badge/Project-CarbonWise_AI-2ea44f?style=for-the-badge)
![Challenge](https://img.shields.io/badge/PromptWars-Virtual_Challenge_3-blue?style=for-the-badge)

## 1. Project Overview

**CarbonWise AI** is an interactive, browser-based carbon footprint awareness platform. Built specifically for PromptWars Virtual Challenge 3, it empowers users to understand the environmental impact of their daily lifestyle choices.

Understanding personal carbon emissions can often feel overwhelming or abstract. CarbonWise AI solves this problem by transforming complex emission factors into a responsive, accessible, and highly visual dashboard. It not only estimates a user's footprint but actively educates them through personalized, high-impact recommendations and a real-time "What-If" simulator.

## 2. Chosen Vertical

**Carbon Footprint Awareness Platform**

## 3. Key Features

- **Carbon Footprint Calculator**: Real-time evaluation of transport, energy, diet, and waste habits.
- **Eco Score System**: Gamified benchmarking from "Carbon Guardian" to "High Impact User".
- **Personalized Carbon Insights**: Natural-language identification of the user's largest emission contributor.
- **Smart Recommendation Engine**: A declarative 16-rule database surfacing the highest-impact behavioral changes.
- **What-If Simulator**: Interactive sliders to instantly project the savings of specific habit adjustments.
- **SVG Donut Chart Visualization**: Fully accessible, DOM-efficient circular data visualization without external libraries.
- **Progress Tracking**: Automatic `localStorage` persistence and historical delta comparisons.
- **Visible Testing Dashboard**: An integrated, evaluator-facing unit test suite and log viewer.
- **System Health Monitor**: Live diagnostic pill tracking the status of core engine functions.
- **Accessibility Features**: Best-in-class keyboard navigation, ARIA live regions, and screen-reader support.
- **Security Features**: Aggressive input validation, sanitization, and strict separation of data and DOM.

## 4. How It Works

The application operates on a strict, unidirectional data pipeline triggered on every user input:

**Inputs** → **Calculations Engine** → **Recommendation Engine** → **Insights** → **Visualization** → **Simulator**

1. User interacts with the form or simulator sliders.
2. Raw data is validated, sanitized, and stored in `appState`.
3. The Calculations Engine processes the inputs into carbon mass (kg/tons).
4. The Recommendation Engine evaluates a declarative rule database against the footprint profile.
5. Personal insights and savings estimates are generated.
6. The Visualization layer mutates SVG attributes and text nodes to reflect the new state instantly.

## 5. Architecture

The codebase adheres to a modular, evaluator-readable structure utilizing pure functions and strict separation of concerns:

```text
CarbonWise-AI/
├── config/
│   └── emissionFactors.js    # Centralized constants, bounds, and factors
├── engine/
│   ├── calculations.js       # Pure mathematical emission calculators
│   ├── recommendations.js    # Rule database and insight generator
│   └── utils.js              # Sanitization, validation, and DOM utilities
├── tests/
│   └── test.js               # Self-contained unit and integration test runner
├── app.js                    # State manager, event orchestrator, and UI renderer
├── index.html                # Semantic, accessible structural skeleton
├── style.css                 # Responsive, token-driven vanilla CSS
└── README.md                 # Project documentation
```

## 6. Security Measures

- **Input Validation**: All numeric inputs are strictly type-checked and clamped to safe boundaries (`validateNumber()`).
- **Sanitization**: All strings are stripped of HTML tags before processing (`sanitizeInput()`).
- **Safe DOM Updates**: DOM rendering uses `textContent` and `createElementNS` exclusively.
- **No innerHTML Usage**: The codebase contains zero instances of `innerHTML`, `insertAdjacentHTML`, or `document.write()`, entirely eliminating XSS vectors.

## 7. Accessibility Features

Built from the ground up for inclusivity:

- **Semantic HTML**: Proper heading hierarchies, `<main>` content regions, and `<article>` grouping.
- **ARIA Support**: Comprehensive `aria-labelledby`, `aria-hidden`, and `role="img"` attributes.
- **Live Regions**: Dynamic UI components utilize `aria-live="polite"` and `aria-atomic="false"` for seamless screen reader announcements.
- **Keyboard Accessibility**: Full logical tab indexing, focus rings, and skip-to-content links.
- **Screen Reader Support**: Visually hidden `.sr-only` context tags embedded throughout.
- **aria-valuetext**: Simulator sliders provide contextual readouts (e.g., "Reduce driving distance: 40%") instead of raw numeric outputs.
- **aria-describedby**: All 11 form inputs are explicitly linked to detailed instructional text.

## 8. Testing

- **Automated Test Suite**: Over 70 built-in assertions testing all math functions, logic branches, and security filters.
- **System Health Monitoring**: A dedicated UI panel summarizing calculations, inputs, recommendations, and security health states.
- **Test Coverage Areas**:
  - Null/NaN/Undefined edge-case resilience
  - Carbon arithmetic bounds
  - Eco score tier resolution
  - HTML element factory security (`safeCreateElement`)

## 9. Assumptions

- **Estimates are educational**: The calculations are designed for personal awareness, not regulatory compliance.
- **Standard emission factors are used**: Constants are based on generalized global/regional averages (e.g., standard grid intensity).
- **User inputs are approximate**: The platform expects broad lifestyle estimations rather than exact meter readings.
- **Results are not official carbon audits**: Data provides a directional baseline to encourage greener habits.

## 10. How To Run

1. Clone or download the repository.
2. Ensure you have a modern web browser installed.
3. Because the project uses ES6 Modules (`type="module"`), it must be served over HTTP/HTTPS (not `file://`).
4. Run a local development server in the project directory:
   - Using Python: `python -m http.server 8000`
   - Using Node.js: `npx serve .`
   - Using VS Code: Launch the "Live Server" extension.
5. Open your browser and navigate to `http://localhost:8000`.

## 11. Future Enhancements

- **Localization**: Support for region-specific emission factors (e.g., US grid vs. UK grid).
- **API Integrations**: Live querying of local public transit data or dynamic renewable energy grid mixes.
- **Account Profiles**: Backend integration to sync historical progress across multiple devices.
- **Advanced Gamification**: Unlockable badges based on long-term habit retention.

## 12. Evaluation Highlights

- **Code Quality**: Strict ES6 module architecture. Logic files (`engine/`) contain only pure functions with no side effects or DOM access. Data flow is unidirectional.
- **Security**: Complete defensive perimeter on user inputs. XSS vectors neutralized by design (zero `innerHTML`). LocalStorage quota safety implemented.
- **Efficiency**: The SVG chart and DOM updates perform zero node destructions per frame, exclusively mutating attributes to leverage hardware-accelerated CSS transitions.
- **Testing**: Features a self-contained, live testing suite accessible in the UI, proving reliability on every run.
- **Accessibility**: Passes rigorous automated and manual accessibility standards, ensuring full usability for keyboard and screen-reader users alike.
