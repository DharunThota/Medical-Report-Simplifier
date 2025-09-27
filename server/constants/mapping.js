const unitConversion = {
        "/uL": { to: "/mm 3", factor: 1 },   // 1 /uL = 1 /mm3
        "/µL": { to: "/mm 3", factor: 1 },
        "x10^9/L": { to: "x 10 9 /L", factor: 1 },
        "10^9/L": { to: "x 10 9 /L", factor: 1 }
        // Add more mappings if needed
    };

const nameMap = {
    "WBC": "White blood cells",
    "RBC": "Red blood cells",
    "Hgb": "Hemoglobin",
    "HCT": "Hematocrit",
    "Haemoglobin": "Hemoglobin",
    "Haematocrit": "Hematocrit",
    // Add more abbreviations or common OCR typos here
};

export { unitConversion, nameMap };