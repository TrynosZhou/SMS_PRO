/**
 * Script to clear all invoices and payment/transaction data
 * Usage: npx ts-node scripts/clear-invoices.ts
 * 
 * WARNING: This will permanently delete all invoice records and payment data!
 */

import 'reflect-metadata';
import { AppDataSource } from '../src/config/database';
import { Invoice } from '../src/entities/Invoice';

async function clearInvoices() {
  try {
    console.log('Connecting to database...');
    await AppDataSource.initialize();
    console.log('✅ Connected to database');

    const invoiceRepository = AppDataSource.getRepository(Invoice);
    
    // Get count before deletion
    const count = await invoiceRepository.count();
    console.log(`Found ${count} invoice(s) to delete`);

    if (count === 0) {
      console.log('No invoices found. Nothing to clear.');
      await AppDataSource.destroy();
      return;
    }

    // Delete all invoices using clear() method
    await invoiceRepository.clear();
    
    console.log(`✅ Deleted ${count} invoice(s) and all associated payment/transaction data`);
    console.log('✅ Invoice and transaction data cleared successfully!');
    console.log('⚠️  Note: Receipts are generated PDFs and are not stored in the database.');
    console.log('   Only invoice and payment data have been cleared.');
    
  } catch (error: any) {
    console.error('❌ Error clearing invoices:', error.message);
    if (error.code === '28P01') {
      console.error('\n💡 Authentication failed. Please check your .env file credentials.');
    } else if (error.code === 'ECONNREFUSED') {
      console.error('\n💡 Connection refused. Please ensure PostgreSQL is running.');
    }
    process.exit(1);
  } finally {
    if (AppDataSource.isInitialized) {
      await AppDataSource.destroy();
    }
  }
}

// Run the script
clearInvoices();

