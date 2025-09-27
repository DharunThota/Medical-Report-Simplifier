export function extractJSON(text) {
    // Match the first {...} block
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;

    try {
        return JSON.parse(match[0]);
    } catch (err) {
        console.error("Failed to parse JSON:", err);
        return null;
    }
}

export function calculateTestConfidence(match, name, unit, reference) {
    let score = 0;
    if (match) score += 0.3;
    if (reference && reference.name === name) score += 0.3;
    if (reference && reference.unit === unit) score += 0.2;
    if (reference?.ref_range) score += 0.2;
    return Math.min(score, 1);
}
