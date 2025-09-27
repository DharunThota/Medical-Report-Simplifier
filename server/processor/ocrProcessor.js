import { mistral } from "../utils/aiClients.js";

/**
 * Step 1: Extract text from an image using OCR.space API
 * @param {Buffer} fileBuffer - The image file buffer.
 * @returns {Promise<string>} - The extracted text.
 */
export async function getTextFromImage(imageData, mimeType = "image/jpeg") {
    try {
    let base64Image;

    if (Buffer.isBuffer(imageData)) {
      base64Image = imageData.toString("base64");
    } else if (typeof imageData === "string") {
      if (imageData.startsWith("data:")) {
        base64Image = imageData.split(",")[1];
        mimeType = imageData.match(/^data:(.*);base64,/)[1];
      } else {
        base64Image = imageData;
      }
    } else {
      throw new Error("Invalid image data. Must be Buffer or Base64 string.");
    }

    const dataUrl = `data:${mimeType};base64,${base64Image}`;

    const ocrResponse = await mistral.ocr.process({
      model: "mistral-ocr-latest",
      document: {
        type: "image_url",
        imageUrl: dataUrl,
      },
      includeImageBase64: true,
    });
    console.log("OCR Response:", ocrResponse);

    // Combine text from all pages
    const combinedText = ocrResponse.pages
      .map((page) => page.markdown || "")
      .join("\n\n");

    return combinedText;
  } catch (err) {
    console.error("OCR failed:", err);
    throw err;
  }
}