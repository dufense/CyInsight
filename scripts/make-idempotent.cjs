const fs = require('fs');
const path = require('path');

function makeIdempotent(sql) {
  const statements = sql.split('--> statement-breakpoint').map(s => s.trim()).filter(s => s.length > 0);
  const output = [];

  for (const stmt of statements) {
    const trimmed = stmt.trim();
    if (!trimmed) continue;
    
    // Remove trailing semicolons for wrapping
    const noTrailingSemi = trimmed.replace(/;+$/, '');
    
    // CREATE TYPE - wrap in exception handler
    if (trimmed.startsWith('CREATE TYPE')) {
      output.push(`DO $$ BEGIN`);
      output.push(`  ${noTrailingSemi};`);
      output.push(`EXCEPTION WHEN duplicate_object THEN null;`);
      output.push(`END $$;`);
      output.push('--> statement-breakpoint');
      continue;
    }
    
    // CREATE TABLE - add IF NOT EXISTS
    if (trimmed.startsWith('CREATE TABLE ')) {
      output.push(noTrailingSemi.replace('CREATE TABLE ', 'CREATE TABLE IF NOT EXISTS ') + ';');
      output.push('--> statement-breakpoint');
      continue;
    }
    
    // CREATE INDEX - add IF NOT EXISTS
    if (trimmed.startsWith('CREATE INDEX ')) {
      output.push(noTrailingSemi.replace('CREATE INDEX ', 'CREATE INDEX IF NOT EXISTS ') + ';');
      output.push('--> statement-breakpoint');
      continue;
    }
    
    // CREATE UNIQUE INDEX - add IF NOT EXISTS
    if (trimmed.startsWith('CREATE UNIQUE INDEX ')) {
      output.push(noTrailingSemi.replace('CREATE UNIQUE INDEX ', 'CREATE UNIQUE INDEX IF NOT EXISTS ') + ';');
      output.push('--> statement-breakpoint');
      continue;
    }
    
    // ALTER TABLE - wrap in exception handler to catch missing table or duplicate object
    if (trimmed.startsWith('ALTER TABLE ')) {
      output.push(`DO $$ BEGIN`);
      output.push(`  ${noTrailingSemi};`);
      output.push(`EXCEPTION WHEN undefined_table OR duplicate_object THEN null;`);
      output.push(`END $$;`);
      output.push('--> statement-breakpoint');
      continue;
    }
    
    // DROP statements - pass through (rare in migrations and should fail loudly)
    output.push(trimmed);
    output.push('--> statement-breakpoint');
  }

  return output.join('\n');
}

// Process all migration files except meta
const migrationsDir = path.join(__dirname, '..', 'migrations');
const files = fs.readdirSync(migrationsDir)
  .filter(f => f.endsWith('.sql'))
  .sort();

for (const file of files) {
  const filePath = path.join(migrationsDir, file);
  const sql = fs.readFileSync(filePath, 'utf-8');
  const idempotent = makeIdempotent(sql);
  fs.writeFileSync(filePath, idempotent);
  console.log(`Processed ${file}`);
}

console.log(`Done! Processed ${files.length} migration files.`);
