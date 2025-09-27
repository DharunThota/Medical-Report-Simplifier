import { openai } from "../utils/aiClients.js";
import { extractJSON } from "../utils/helpers.js";
import { nameMap } from "../constants/mapping.js";

/**
 * Step 3: Generate a patient-friendly summary using the Gemini API.
 * @param {Array<object>} normalizedTests - The array of normalized test objects.
 * @returns {Promise<object>} - The summary and explanations.
 */
export async function getPatientSummary(normalizedTests) {
    const systemPrompt = `
        You are a helpful medical assistant. Your role is to explain medical test results in simple, easy-to-understand language for a patient.

        Instructions:
        - DO NOT provide a diagnosis.
        - DO NOT use complex medical jargon.
        - Keep explanations brief and clear.
        - Base your output ONLY on the provided test data.
        - Structure your response as a JSON object with:
        {
            "summary": "A short overview that explicitly mentions each test name and whether it is normal, high, or low.",
            "explanations": ["A simple explanation for each test in plain language."]
        }
        - The "summary" MUST mention the test names (e.g., "Hemoglobin is high, WBC is normal, Ammonia is high").
        - The "explanations" array should include one explanation per test.
    `;
  
  const userQuery = `
    Here are the medical test results: ${JSON.stringify(normalizedTests)}.
    Please provide a simplified summary and explanation.
  `;
  
  try {
    const response = await openai.chat.completions.create({
        model: "mistral-small", // or "gpt-4o", "gpt-4", etc.
        messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userQuery }
        ],
        temperature: 0 // deterministic output
    });
    console.log("Mistral API Raw Summary Response:", response);

    // const text = result.candidates[0].content;
    const text = response.choices[0].message.content;
    console.log("LLM Summary Response:", text); 

    const resultJson = extractJSON(text);
    console.log("Extracted Summary JSON:", resultJson);
    
    // Step 3 (Guardrail): Check for hallucinated tests
    const llmTestNames = (resultJson.summary + " " + resultJson.explanations.join(" ")).toLowerCase();
    console.log("LLM Test Names:", llmTestNames);
    const originalTestNames = normalizedTests.map(t => {
        const name = nameMap[t.name] || t.name;
        return name.toLowerCase();
    });
    console.log("Original Test Names:", originalTestNames);
    
    for (const testName of originalTestNames) {
        if (!llmTestNames.includes(testName)) {
             return { status: "unprocessed", reason: `Hallucinated results: LLM failed to mention ${testName}` };
        }
    }

    return resultJson;

  } catch (error) {
    console.error("Error calling Gemini API for summary:", error);
    throw new Error("Failed to generate patient summary.");
  }
}