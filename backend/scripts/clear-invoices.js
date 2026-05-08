const { Client } = require('pg');
require('dotenv').config();

async function clearInvoices() {
  const client = new Client({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    user: process.env.DB_USERNAME || 'postgres',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'sms_db',
  });

  try {
    await client.connect();
    console.log('✅ Connected to database');

    // Delete all invoices (this will also clear all payment/transaction data)
    const result = await client.query('DELETE FROM invoices');
    console.log(`✅ Deleted ${result.rowCount} invoice(s) and all associated payment/transaction data`);

    // Reset invoice sequence if using auto-increment (though we're using UUIDs, this is for safety)
    // Note: Since we're using UUIDs, we don't need to reset sequences
    
    console.log('✅ Invoice and transaction data cleared successfully!');
    console.log('⚠️  Note: Receipts are generated PDFs and are not stored in the database.');
    console.log('   Only invoice and payment data have been cleared.');
    
  } catch (error) {
    console.error('❌ Error clearing invoices:', error.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

// Run the script
clearInvoices();

