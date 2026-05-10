import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { loadConfig } from './config';

function tmp(name: string): string {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'dynatable-config-test-')), name);
}

function writeJsonConfig(filePath: string, body: unknown): string {
  fs.writeFileSync(filePath, JSON.stringify(body));
  return filePath;
}

describe('loadConfig - validation', () => {
  test('rejects when tableName is missing', async () => {
    const p = writeJsonConfig(tmp('cfg.json'), { client: { region: 'us-east-1' } });
    await expect(loadConfig(p)).rejects.toThrow(/tableName/);
  });

  test("rejects when tableName contains characters DynamoDB doesn't allow", async () => {
    const p = writeJsonConfig(tmp('cfg.json'), {
      tableName: 'has spaces!',
      client: { region: 'us-east-1' },
    });
    await expect(loadConfig(p)).rejects.toThrow(/tableName.*must be/i);
  });

  test('rejects when tableName is too short', async () => {
    const p = writeJsonConfig(tmp('cfg.json'), {
      tableName: 'ab',
      client: { region: 'us-east-1' },
    });
    await expect(loadConfig(p)).rejects.toThrow(/tableName/);
  });

  test('accepts valid tableName with underscores, dashes, dots, digits', async () => {
    const p = writeJsonConfig(tmp('cfg.json'), {
      tableName: 'My-table_v2.0',
      client: { region: 'us-east-1' },
    });
    const cfg = await loadConfig(p);
    expect(cfg.tableName).toBe('My-table_v2.0');
  });

  test('rejects when client.region is missing', async () => {
    const p = writeJsonConfig(tmp('cfg.json'), { tableName: 'TestTable', client: {} });
    await expect(loadConfig(p)).rejects.toThrow(/region/);
  });

  test('rejects when migrationsDir points at an existing non-directory', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dynatable-config-test-'));
    const filePath = path.join(dir, 'not-a-dir');
    fs.writeFileSync(filePath, 'this is a file, not a directory');

    const cfgPath = path.join(dir, 'cfg.json');
    fs.writeFileSync(
      cfgPath,
      JSON.stringify({
        tableName: 'TestTable',
        client: { region: 'us-east-1' },
        migrationsDir: filePath,
      })
    );

    await expect(loadConfig(cfgPath)).rejects.toThrow(/not a directory/);
  });

  test('defaults migrationsDir to ./migrations when omitted', async () => {
    const p = writeJsonConfig(tmp('cfg.json'), {
      tableName: 'TestTable',
      client: { region: 'us-east-1' },
    });
    const cfg = await loadConfig(p);
    expect(cfg.migrationsDir).toBe('./migrations');
  });
});
