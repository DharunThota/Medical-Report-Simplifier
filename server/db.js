import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';

dotenv.config();

const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB_NAME;
const collectionName = process.env.MONGODB_COLLECTION_NAME;
const client = new MongoClient(uri);

let db;

/**
 * Connects to the MongoDB database.
 * This should be called once when the application starts.
 */
async function connectDB() {
  try {
    await client.connect();
    console.log('Connected successfully to MongoDB');
    db = client.db(dbName);
  } catch (error) {
    console.error('Could not connect to MongoDB', error);
    process.exit(1);
  }
}

/**
 * Finds reference ranges for a given medical test from the database.
 * @param {string} testName - The name of the test (e.g., "Hemoglobin").
 * @param {string} unit - The unit of measurement (e.g., "g/dL").
 * @param {string} [sex='female'] - The patient's sex for filtering ranges.
 * @returns {Promise<object|null>} - A formatted reference object or null if not found.
 */
async function findTestReference(testName, unit, sex = 'female') {
  if (!db) {
    throw new Error('Database not initialized. Call connectDB first.');
  }

  const collection = db.collection(collectionName);
  
  // Find a document where the 'test' field matches, case-insensitively
  const testDoc = await collection.findOne({ test: new RegExp(`^${testName}$`, 'i') });

  if (!testDoc || !testDoc.ranges || !testDoc.ranges[unit]) {
    return null; // Test or unit not found in the database
  }

  console.log(`test: ${testDoc.test}, unit: ${unit}`);
  const unitRanges = testDoc.ranges[unit];
  let specificRange = null;

  // Handle structures where ranges are an array (e.g., by sex)
  if (Array.isArray(unitRanges)) {
    specificRange = unitRanges.find(range => range.sex === sex.toLowerCase());
  } 
  // Handle structures where ranges are a single object
  else if (typeof unitRanges === 'object' && unitRanges !== null) {
    specificRange = unitRanges;
  }

  if (!specificRange) {
    return null; // No matching range found for the given criteria (e.g., sex)
  }

  return {
    name: testDoc.test,
    unit: unit,
    ref_range: {
      low: specificRange.low,
      high: specificRange.high,
    },
  };
}

export { connectDB, findTestReference };

