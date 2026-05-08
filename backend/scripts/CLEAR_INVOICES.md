# Clear Invoices and Transactions Script

This script clears all invoice and payment/transaction data from the database.

## ⚠️ WARNING

**This action is irreversible!** All invoice records and payment data will be permanently deleted.

## What gets deleted:

- All invoice records
- All payment amounts (paidAmount, balance, prepaidAmount)
- All transaction history stored in invoices

## What is NOT affected:

- Student records
- User accounts
- Settings
- Other system data

## Note about Receipts:

Receipts are generated as PDF files from invoice data. They are not stored in the database, so deleting invoices will not delete any PDF files that may have been downloaded or saved elsewhere.

## Usage

```bash
cd backend
npm run clear-invoices
```

Or run directly with TypeScript:
```bash
npx ts-node scripts/clear-invoices.ts
```

## Requirements

- PostgreSQL must be running
- `.env` file must be configured with correct database credentials
- User must have DELETE permissions on the invoices table

## Example Output

```
✅ Connected to database
✅ Deleted 25 invoice(s) and all associated payment/transaction data
✅ Invoice and transaction data cleared successfully!
⚠️  Note: Receipts are generated PDFs and are not stored in the database.
   Only invoice and payment data have been cleared.
```

## Troubleshooting

**"Authentication failed"**
- Check `DB_USERNAME` and `DB_PASSWORD` in `.env`
- Verify PostgreSQL credentials

**"Connection refused"**
- Ensure PostgreSQL service is running
- Check `DB_HOST` and `DB_PORT` in `.env`

**"Permission denied"**
- User needs DELETE permission on the invoices table
- Try using a user with appropriate database privileges

