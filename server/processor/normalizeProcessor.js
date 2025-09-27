import { findTestReference } from "../database/db.js";
import { unitConversion, nameMap } from "../constants/mapping.js";
import { calculateTestConfidence } from "../utils/helpers.js";

/**
 * Step 2: Normalize the extracted raw tests against the MongoDB database.
 * This function is now async to handle database calls.
 * @param {Array<string>} rawTests - Array of raw test strings.
 * @param {string} [sex='female'] - Patient's sex for gender-specific ranges.
 * @returns {Promise<object>} - The normalized tests and a confidence score.
 */
export async function normalizeTests(rawTests, sex = 'female') {
    const tests = [];
    let confidence = 0;

    // Use a for...of loop to correctly handle await inside the loop
    for (const testStr of rawTests) {
        const match = testStr.match(/([a-zA-Z\s]+) ([\d.]+) ([a-zA-Z\/\d\^]+)(?: \((Low|High|Normal)\))?/i);
        if (match) {
            console.log("Regex Match:", match);
            const [, rawName, valueStr, rawUnit, status] = match;
            // Await the asynchronous database call
            let value = parseFloat(valueStr.trim());
            let unit = rawUnit.trim();
            let name = rawName.trim();

            // Convert unit if necessary
            if (unitConversion[unit]) {
                value = value * unitConversion[unit].factor;
                unit = unitConversion[unit].to;
            }
            
            if (nameMap[name]) {
                name = nameMap[name];
            }
            console.log(`Converted Test: ${name}, Value: ${value}, Unit: ${unit}`);
            
            // Lookup reference in DB using converted unit
            const reference = await findTestReference(name, unit, sex);

            if (reference) {
                let determinedStatus = status ? status.toLowerCase() : 'normal';

                // Double-check status against reference range if not provided, correct anyway
                console.log(name, value, reference.ref_range.low, reference.ref_range.high)
                if (value < reference.ref_range.low) determinedStatus = 'low';
                else if (value > reference.ref_range.high) determinedStatus = 'high';

                console.log(`Normalized Test: ${name}, Value: ${value}, Unit: ${unit}, Status: ${determinedStatus}`);

                tests.push({
                    name: reference.name,
                    value: value,
                    unit: unit,
                    status: determinedStatus,
                    ref_range: reference.ref_range,
                });
                confidence += calculateTestConfidence(match, rawName, rawUnit, reference)
            }
        }
    }
    confidence = (tests.length > 0 ? confidence / tests.length : 0).toFixed(2);

    return {
        tests: tests,
        normalization_confidence: confidence // Static confidence
    };
}