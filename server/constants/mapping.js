const unitConversion = {
        "/uL": { to: "/mm 3", factor: 1 },   // 1 /uL = 1 /mm3
        "/µL": { to: "/mm 3", factor: 1 },
        "x10^9/L": { to: "x 10 9 /L", factor: 1 },
        "10^9/L": { to: "x 10 9 /L", factor: 1 },
        "cumm": { to: "/mm 3", factor: 1 }, // assuming cumm means cubic millimeter
        "/cumm": { to: "/mm 3", factor: 1 },
        // Add more mappings if needed
    };

const nameMap = {
    "WBC": "White blood cells",
    "RBC": "Red blood cells",
    "Hgb": "Hemoglobin",
    "HCT": "Hematocrit",
    "Hct": "Hematocrit",
    "PLT": "Platelets",
    "Neut": "Neutrophils",
    "Haemoglobin": "Hemoglobin",
    "Haematocrit": "Hematocrit",
    "Platelet Count": "Platelets",
    "MCV": "Mean corpuscular volume",
    "MCH": "Mean corpuscular hemoglobin",
    "MCHC": "Mean corpuscular hemoglobin concentration",
    // Add more abbreviations or common OCR typos here
};

export { unitConversion, nameMap };