// Authorization unit tests construct callers with a stub database and never connect.
process.env.DATABASE_URL ??= "postgresql://postgres:postgres@127.0.0.1:55432/wayv";
