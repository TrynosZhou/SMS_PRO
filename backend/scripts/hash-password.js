/**
 * Quick script to hash a password using bcryptjs (same as the backend)
 * Usage: node scripts/hash-password.js <password>
 */

const bcrypt = require('bcryptjs');

const password = process.argv[2];

if (!password) {
  console.error('Usage: node scripts/hash-password.js <password>');
  process.exit(1);
}

bcrypt.hash(password, 10, (err, hash) => {
  if (err) {
    console.error('Error hashing password:', err);
    process.exit(1);
  }
  console.log('\n✅ Hashed password:');
  console.log(hash);
  console.log('\nUse this hash in your SQL INSERT statement.\n');
});

