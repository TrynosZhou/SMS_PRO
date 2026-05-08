# Database Setup Scripts

## create-database.js

Automatically creates the `sms_db` database if it doesn't exist.

### Usage

```bash
# Make sure .env file is configured first
npm run setup-db
```

### What it does:

1. Connects to PostgreSQL using credentials from `.env`
2. Checks if `sms_db` database exists
3. Creates it if it doesn't exist
4. Reports success or helpful error messages

### Requirements:

- PostgreSQL must be installed and running
- `.env` file must be configured with database credentials
- User must have permission to create databases

### Troubleshooting:

**"Authentication failed"**
- Check `DB_USERNAME` and `DB_PASSWORD` in `.env`
- Verify PostgreSQL credentials

**"Connection refused"**
- Ensure PostgreSQL service is running
- Check `DB_HOST` and `DB_PORT` in `.env`

**"Permission denied"**
- User needs `CREATEDB` privilege
- Try using `postgres` superuser account

