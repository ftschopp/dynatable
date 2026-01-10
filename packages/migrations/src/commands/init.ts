import * as fs from 'fs';
import * as path from 'path';
import { ConfigLoader } from '../core/config';

export async function initProject(): Promise<void> {
  const cwd = process.cwd();

  console.log('\n🚀 Initializing DynamoDB migrations\n');

  // Create migrations directory
  const migrationsDir = path.join(cwd, 'migrations');
  if (!fs.existsSync(migrationsDir)) {
    fs.mkdirSync(migrationsDir, { recursive: true });
    console.log(`✅ Created: ${migrationsDir}/`);

    // Create .gitkeep
    fs.writeFileSync(path.join(migrationsDir, '.gitkeep'), '');
  } else {
    console.log(`⚠️  Directory already exists: ${migrationsDir}/`);
  }

  // Create config file
  const configPath = path.join(cwd, 'dynatable.config.js');
  if (!fs.existsSync(configPath)) {
    ConfigLoader.createDefaultConfig(configPath);
  } else {
    console.log(`⚠️  Config already exists: ${configPath}`);
  }

  console.log('\n✅ Initialization complete!\n');
  console.log('Next steps:');
  console.log('  1. Edit dynatable.config.js with your DynamoDB settings');
  console.log('  2. Create your first migration:');
  console.log('     dynatable-migrate create add_user_email');
  console.log('  3. Run migrations:');
  console.log('     dynatable-migrate up\n');
}
