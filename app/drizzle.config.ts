import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: '../shared/src/sync/schema.ts',
  out: './src/db/migrations',
  dialect: 'sqlite',
  driver: 'expo', // generates a migrations.js barrel for drizzle-orm/expo-sqlite/migrator
});
