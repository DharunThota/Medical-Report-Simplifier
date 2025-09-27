import { findTestReference } from "../database/db.js";
import { unitConversion, nameMap } from "../constants/mapping.js";
import { calculateTestConfidence } from "../utils/helpers.js";
import { parseDriver } from "./parseProcessor.js";

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
        const match = testStr.match(/([a-zA-Z\s]+) ([\d.]+) ([a-zA-Z\/\d\^\%\s]+)(?: \((Low|High|Normal)\))?/i);
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
            
            // if (nameMap[name]) {
            //     name = nameMap[name];
            // }
            for (const key in nameMap) {
                const regex = new RegExp(`\\b${key}\\b`, 'i'); // word-boundary match
                if (regex.test(name)) {
                    name = nameMap[key];
                    break; // stop after first match
                }
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

export async function normalizeDriver(req) {
    const parseResults = await parseDriver(req);
    if (parseResults.status === 'unprocessed') {
        return parseResults;
    }

    const tests_raw = parseResults.tests_raw;
    const sex = req.body.sex;

    // Step 2: Normalize tests (now an async DB operation)
    const result = await normalizeTests(tests_raw, sex);
    const normalizedTests = result.tests;
        if (normalizedTests.length === 0) {
        return res.status(400).json({ status: "unprocessed", reason: "Could not normalize any of the extracted tests." });
    }
    console.log("Normalized Tests:", result)

    return result
}