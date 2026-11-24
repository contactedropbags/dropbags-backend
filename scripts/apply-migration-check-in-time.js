require("dotenv").config();

const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

function getConnectionString() {
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }

  const password = process.env.SUPABASE_DB_PASSWORD;
  const supabaseUrl = process.env.SUPABASE_URL;

  if (!password || !supabaseUrl) {
    throw new Error(
      "Set DATABASE_URL or SUPABASE_DB_PASSWORD + SUPABASE_URL in .env to run DDL migrations."
    );
  }

  const ref = new URL(supabaseUrl).hostname.split(".")[0];

  return `postgresql://postgres:${encodeURIComponent(password)}@db.${ref}.supabase.co:5432/postgres`;
}

async function main() {
  const sqlPath = path.join(__dirname, "../migrations/001_add_check_in_time.sql");
  const sql = fs.readFileSync(sqlPath, "utf8");
  const client = new Client({
    connectionString: getConnectionString(),
    ssl: { rejectUnauthorized: false }
  });

  await client.connect();

  try {
    await client.query(sql);

    const { rows } = await client.query(`
      select column_name, data_type, is_nullable
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'bookings'
        and column_name = 'checkInTime'
    `);

    if (!rows.length) {
      throw new Error('Column "checkInTime" was not found after migration.');
    }

    const { rows: counts } = await client.query(`
      select count(*)::int as total,
             count("checkInTime")::int as with_check_in
      from public.bookings
    `);

    console.log("Migration applied successfully.");
    console.log("Column:", rows[0]);
    console.log("Bookings:", counts[0]);
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error("Migration failed:", error.message);
  process.exit(1);
});
