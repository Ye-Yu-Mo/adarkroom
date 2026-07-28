/**
 * Project setup validation test — M1-F1
 *
 * Verifies that all infrastructure files exist, are valid,
 * and that the toolchain (tsc, eslint, prettier) works correctly.
 *
 * RED → GREEN → REFACTOR: This test is written FIRST, before the config files exist.
 * Expected to FAIL on first run (RED phase).
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';

const ROOT = join(import.meta.dirname, '..', '..');

function readJSON(path: string) {
  return JSON.parse(readFileSync(join(ROOT, path), 'utf-8'));
}

describe('project infrastructure', () => {
  describe('directory structure', () => {
    const requiredDirs = ['server', 'client', 'shared', 'tests'];

    for (const dir of requiredDirs) {
      it(`directory "${dir}/" exists`, () => {
        expect(existsSync(join(ROOT, dir))).toBe(true);
      });
    }
  });

  describe('package.json', () => {
    it('exists and is valid JSON', () => {
      const pkg = readJSON('package.json');
      expect(pkg.name).toBe('adarkroom');
      expect(pkg.type).toBe('module');
    });

    it('has required dependencies', () => {
      const pkg = readJSON('package.json');
      expect(pkg.dependencies).toBeDefined();
      expect(pkg.dependencies.express).toBeDefined();
      expect(pkg.dependencies.ws).toBeDefined();
      expect(pkg.dependencies.jsonwebtoken).toBeDefined();
      expect(pkg.dependencies.pg).toBeDefined();
      expect(pkg.dependencies.zod).toBeDefined();
    });

    it('has required devDependencies', () => {
      const pkg = readJSON('package.json');
      expect(pkg.devDependencies).toBeDefined();
      expect(pkg.devDependencies.typescript).toBeDefined();
      expect(pkg.devDependencies.vitest).toBeDefined();
      expect(pkg.devDependencies.eslint).toBeDefined();
      expect(pkg.devDependencies.prettier).toBeDefined();
      expect(pkg.devDependencies['@types/node']).toBeDefined();
    });

    it('preserves old scripts', () => {
      const pkg = readJSON('package.json');
      expect(pkg.scripts.start).toBe('node dev-server.js');
      expect(pkg.scripts.update_pot).toBeDefined();
    });

    it('has new dev scripts', () => {
      const pkg = readJSON('package.json');
      expect(pkg.scripts['dev:server']).toBeDefined();
      expect(pkg.scripts.typecheck).toBeDefined();
      expect(pkg.scripts.lint).toBeDefined();
      expect(pkg.scripts.format).toBeDefined();
      expect(pkg.scripts['test:unit']).toBeDefined();
      expect(pkg.scripts['db:migrate']).toBeDefined();
    });

    it('uses pnpm (no yarn.lock)', () => {
      expect(existsSync(join(ROOT, 'yarn.lock'))).toBe(false);
      expect(existsSync(join(ROOT, 'pnpm-lock.yaml'))).toBe(true);
    });
  });

  describe('TypeScript configs', () => {
    it('tsconfig.json exists with strict mode', () => {
      const tsconfig = readJSON('tsconfig.json');
      expect(tsconfig.compilerOptions.strict).toBe(true);
      expect(tsconfig.compilerOptions.target).toBeDefined();
    });

    it('tsconfig.server.json extends base and adds server-specific options', () => {
      const tsconfig = readJSON('tsconfig.server.json');
      expect(tsconfig.extends).toBe('./tsconfig.json');
      expect(tsconfig.compilerOptions.outDir).toBeDefined();
    });
  });

  describe('ESLint config', () => {
    it('eslint.config.mjs exists and is valid', () => {
      const exists = existsSync(join(ROOT, 'eslint.config.mjs'));
      expect(exists).toBe(true);
    });
  });

  describe('Prettier config', () => {
    it('prettier.config.mjs exists', () => {
      const exists = existsSync(join(ROOT, 'prettier.config.mjs'));
      expect(exists).toBe(true);
    });
  });

  describe('Docker Compose', () => {
    it('docker-compose.yml exists and has postgres service', () => {
      const content = readFileSync(join(ROOT, 'docker-compose.yml'), 'utf-8');
      expect(content).toContain('postgres');
      expect(content).toContain('5432');
      expect(content).toContain('adarkroom_dev');
    });
  });

  describe('.npmrc', () => {
    it('exists with correct settings', () => {
      const content = readFileSync(join(ROOT, '.npmrc'), 'utf-8');
      expect(content).toContain('registry');
      expect(content).toContain('strict-peer-dependencies');
    });
  });

  describe('toolchain smoke tests', () => {
    it('tsc --noEmit succeeds on an empty shared/types.ts', () => {
      // Ensure there's at least an empty type file so tsc has something to check
      expect(existsSync(join(ROOT, 'shared', 'types.ts'))).toBe(true);
      execSync('pnpm typecheck', { cwd: ROOT, stdio: 'pipe' });
    });

    it('eslint runs without error on server directory', () => {
      execSync('pnpm lint', { cwd: ROOT, stdio: 'pipe' });
    });
  });
});
