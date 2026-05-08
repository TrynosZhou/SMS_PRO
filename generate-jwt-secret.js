// Generate JWT Secret for Render deployment
const crypto = require('crypto');
const secret = crypto.randomBytes(32).toString('hex');
console.log('\n========================================');
console.log('JWT_SECRET for Render Environment Variable:');
console.log('========================================');
console.log(secret);
console.log('========================================\n');
console.log('Copy this value and paste it as JWT_SECRET in Render dashboard\n');

