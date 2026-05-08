/**
 * Script to create an admin user
 * Usage: node scripts/create-admin.js <email> <password> <firstName> <lastName>
 */

require('dotenv').config();
const bcrypt = require('bcryptjs');
const { DataSource } = require('typeorm');
const { User, UserRole } = require('../dist/entities/User').User || require('../src/entities/User');

// This script should be run after building the project
// For development, you can use ts-node directly

async function createAdmin() {
  const args = process.argv.slice(2);
  
  if (args.length < 4) {
    console.log('Usage: node scripts/create-admin.js <email> <password> <firstName> <lastName>');
    console.log('Example: node scripts/create-admin.js admin@school.com admin123 Admin User');
    process.exit(1);
  }

  const [email, password, firstName, lastName] = args;

  // Note: This is a simplified version. In production, use the built entities
  console.log('Note: This script requires the project to be built first.');
  console.log('For development, use the API endpoint: POST /api/auth/register');
  console.log('Then update the user role in the database to "admin"');
}

createAdmin();

