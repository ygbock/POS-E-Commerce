/**
 * Centralized Environment & Runtime Configuration Contract (UPG-001R1)
 * 
 * Enforces strict environment boundaries between development, test, staging, and production.
 * Ensures fail-closed validation on startup without exposing credentials in logs or error messages.
 */

export type DeployEnvironment = 'development' | 'test' | 'staging' | 'production';

export interface EnvironmentVariableStatus {
  name: string;
  configured: boolean;
  status: 'VALID' | 'MISSING' | 'INVALID';
  note?: string;
}

export interface ValidatedConfig {
  deployEnv: DeployEnvironment;
  nodeEnv: string;
  isProduction: boolean;
  isStaging: boolean;
  isTest: boolean;
  isDevelopment: boolean;
  port: number;
  appUrl?: string;
  databaseUrl?: string;
  pgHost?: string;
  jwtSecretConfigured: boolean;
}

export interface EnvironmentValidationReport {
  valid: boolean;
  deployEnv: DeployEnvironment;
  variables: EnvironmentVariableStatus[];
}

const VALID_ENVS: DeployEnvironment[] = ['development', 'test', 'staging', 'production'];

/**
 * Validates the runtime configuration against environment policies.
 * Fail-closed: Throws on any contract violation in staging or production.
 */
export function validateEnvironment(env: NodeJS.ProcessEnv = process.env): ValidatedConfig {
  const rawNode = env.NODE_ENV !== undefined ? env.NODE_ENV.trim() : '';
  const nodeEnvRaw = (rawNode === 'undefined' || rawNode === 'null') ? '' : rawNode;

  const rawDeploy = env.DEPLOY_ENV !== undefined ? env.DEPLOY_ENV.trim() : '';
  const deployEnvRaw = (rawDeploy === 'undefined' || rawDeploy === 'null') ? '' : rawDeploy;

  const normalizedNodeEnv = nodeEnvRaw.toLowerCase();
  const normalizedDeployEnv = deployEnvRaw.toLowerCase();

  // 1. Validate NODE_ENV if supplied
  if (normalizedNodeEnv !== '') {
    if (!VALID_ENVS.includes(normalizedNodeEnv as DeployEnvironment)) {
      throw new Error(`[AbaCha Config Fatal] Invalid or unknown NODE_ENV "${nodeEnvRaw}". Must be one of: ${VALID_ENVS.join(', ')}`);
    }
  }

  // 2. Validate DEPLOY_ENV if supplied
  if (normalizedDeployEnv !== '') {
    if (!VALID_ENVS.includes(normalizedDeployEnv as DeployEnvironment)) {
      throw new Error(`[AbaCha Config Fatal] Invalid or unknown DEPLOY_ENV "${deployEnvRaw}". Must be one of: ${VALID_ENVS.join(', ')}`);
    }
  }

  // 3. Strictly one-to-one contract: reject every mismatch when both are supplied
  if (normalizedDeployEnv !== '' && normalizedNodeEnv !== '') {
    if (normalizedDeployEnv !== normalizedNodeEnv) {
      throw new Error(`[AbaCha Config Fatal] Contradictory environment configuration: DEPLOY_ENV=${normalizedDeployEnv} conflicts with NODE_ENV=${normalizedNodeEnv}.`);
    }
  }

  // 4. Authoritative environment resolution
  let deployEnv: DeployEnvironment;
  if (normalizedDeployEnv !== '') {
    deployEnv = normalizedDeployEnv as DeployEnvironment;
  } else if (normalizedNodeEnv !== '') {
    deployEnv = normalizedNodeEnv as DeployEnvironment;
  } else {
    deployEnv = 'development';
  }

  // Mutually exclusive environment booleans
  const isProduction = deployEnv === 'production';
  const isStaging = deployEnv === 'staging';
  const isTest = deployEnv === 'test';
  const isDevelopment = deployEnv === 'development';

  // 2. Strict PORT Validation
  const portRaw = env.PORT !== undefined ? env.PORT.trim() : '3000';
  if (!/^\d+$/.test(portRaw)) {
    throw new Error(`[AbaCha Config Fatal] PORT must be a valid decimal integer string between 1 and 65535. Received: "${portRaw}"`);
  }
  const port = parseInt(portRaw, 10);
  if (port < 1 || port > 65535) {
    throw new Error(`[AbaCha Config Fatal] PORT must be between 1 and 65535. Received: ${port}`);
  }

  // 3. PostgreSQL Persistence & URL Validation
  const dbUrl = env.DATABASE_URL?.trim();
  const pgHost = env.PGHOST?.trim();

  if (isProduction || isStaging) {
    if (!dbUrl && !pgHost) {
      throw new Error('[AbaCha Config Fatal] Production environment requires a valid PostgreSQL configuration (DATABASE_URL or PGHOST is missing).');
    }

    if (dbUrl) {
      try {
        const parsed = new URL(dbUrl);
        if (parsed.protocol !== 'postgresql:' && parsed.protocol !== 'postgres:') {
          throw new Error('Invalid protocol');
        }
        if (!parsed.hostname || parsed.hostname.trim() === '') {
          throw new Error('Missing host');
        }
        const pathname = parsed.pathname ? parsed.pathname.trim() : '';
        if (pathname.length <= 1 || pathname === '/') {
          throw new Error('Missing database name');
        }
      } catch {
        throw new Error('[AbaCha Config Fatal] Invalid DATABASE_URL: must be a valid PostgreSQL connection URL with protocol (postgresql: or postgres:), host, and database name.');
      }
    }

    // 4. JWT Secret Mandate
    const jwtSecret = env.JWT_SECRET?.trim();
    if (!jwtSecret) {
      throw new Error('[AbaCha Config Fatal] JWT_SECRET environment variable is mandatory in production.');
    }
    const lowerSecret = jwtSecret.toLowerCase();
    if (jwtSecret.length < 32 || lowerSecret.includes('dev') || lowerSecret.includes('default')) {
      throw new Error('[AbaCha Config Fatal] Production JWT_SECRET must be a high-entropy string of at least 32 characters.');
    }

    // 5. Configurable Cross-Environment Separation Contract
    if (isStaging) {
      if (env.PRODUCTION_DATABASE_URL && dbUrl && dbUrl === env.PRODUCTION_DATABASE_URL.trim()) {
        throw new Error('[AbaCha Config Fatal] Cross-environment violation: Staging environment cannot use production database.');
      }
      if (env.PRODUCTION_APP_URL && env.APP_URL && env.APP_URL.trim() === env.PRODUCTION_APP_URL.trim()) {
        throw new Error('[AbaCha Config Fatal] Cross-environment violation: Staging APP_URL cannot match production APP_URL.');
      }
    }

    if (isProduction) {
      if (env.STAGING_DATABASE_URL && dbUrl && dbUrl === env.STAGING_DATABASE_URL.trim()) {
        throw new Error('[AbaCha Config Fatal] Cross-environment violation: Production environment cannot use staging database.');
      }
      if (env.STAGING_APP_URL && env.APP_URL && env.APP_URL.trim() === env.STAGING_APP_URL.trim()) {
        throw new Error('[AbaCha Config Fatal] Cross-environment violation: Production APP_URL cannot match staging APP_URL.');
      }
    }

    // 6. APP_URL Validation
    if (env.APP_URL) {
      const appUrlRaw = env.APP_URL.trim();
      let parsedAppUrl: URL;
      try {
        parsedAppUrl = new URL(appUrlRaw);
      } catch {
        throw new Error('[AbaCha Config Fatal] Invalid APP_URL: malformed URL string.');
      }

      if (parsedAppUrl.protocol !== 'https:') {
        throw new Error(`[AbaCha Config Fatal] APP_URL must use secure HTTPS protocol in ${deployEnv}. Received protocol: "${parsedAppUrl.protocol}"`);
      }

      if (!parsedAppUrl.hostname || parsedAppUrl.hostname.trim() === '') {
        throw new Error('[AbaCha Config Fatal] Invalid APP_URL: missing hostname.');
      }
    }
  } else {
    // In dev / test, validate DATABASE_URL and APP_URL syntax if provided
    if (dbUrl) {
      try {
        const parsed = new URL(dbUrl);
        if (parsed.protocol !== 'postgresql:' && parsed.protocol !== 'postgres:') {
          throw new Error('Invalid protocol');
        }
      } catch {
        throw new Error('[AbaCha Config Fatal] Invalid DATABASE_URL: must be a valid PostgreSQL connection URL with protocol (postgresql: or postgres:), host, and database name.');
      }
    }
    if (env.APP_URL) {
      try {
        new URL(env.APP_URL.trim());
      } catch {
        throw new Error('[AbaCha Config Fatal] Invalid APP_URL: malformed URL string.');
      }
    }
  }

  return {
    deployEnv,
    nodeEnv: nodeEnvRaw || 'development',
    isProduction,
    isStaging,
    isTest,
    isDevelopment,
    port,
    appUrl: env.APP_URL?.trim(),
    databaseUrl: dbUrl,
    pgHost,
    jwtSecretConfigured: Boolean(env.JWT_SECRET),
  };
}

/**
 * Returns a sanitized report of environment variable statuses without disclosing secrets.
 */
export function getSanitizedEnvironmentReport(env: NodeJS.ProcessEnv = process.env): EnvironmentValidationReport {
  const varsToCheck = [
    'DEPLOY_ENV',
    'NODE_ENV',
    'PORT',
    'DATABASE_URL',
    'PGHOST',
    'JWT_SECRET',
    'APP_URL',
  ];

  const statuses: EnvironmentVariableStatus[] = varsToCheck.map((name) => {
    const val = env[name];
    if (!val) {
      return { name, configured: false, status: 'MISSING' };
    }
    if (name === 'JWT_SECRET') {
      const valid = val.length >= 32 && !val.toLowerCase().includes('dev') && !val.toLowerCase().includes('default');
      return { name, configured: true, status: valid ? 'VALID' : 'INVALID', note: valid ? 'High Entropy' : 'Weak or Short' };
    }
    if (name === 'PORT') {
      const valid = /^\d+$/.test(val.trim()) && parseInt(val.trim(), 10) >= 1 && parseInt(val.trim(), 10) <= 65535;
      return { name, configured: true, status: valid ? 'VALID' : 'INVALID' };
    }
    if (name === 'APP_URL') {
      try {
        const u = new URL(val.trim());
        const valid = u.protocol === 'https:' || u.protocol === 'http:';
        return { name, configured: true, status: valid ? 'VALID' : 'INVALID' };
      } catch {
        return { name, configured: true, status: 'INVALID', note: 'Malformed URL' };
      }
    }
    if (name === 'DATABASE_URL') {
      try {
        const u = new URL(val.trim());
        const valid = (u.protocol === 'postgresql:' || u.protocol === 'postgres:') && Boolean(u.hostname) && (u.pathname.length > 1);
        return { name, configured: true, status: valid ? 'VALID' : 'INVALID' };
      } catch {
        return { name, configured: true, status: 'INVALID', note: 'Malformed connection string' };
      }
    }
    return { name, configured: true, status: 'VALID' };
  });

  let deployEnv: DeployEnvironment = 'development';
  try {
    const config = validateEnvironment(env);
    deployEnv = config.deployEnv;
    return { valid: true, deployEnv, variables: statuses };
  } catch {
    return { valid: false, deployEnv, variables: statuses };
  }
}
