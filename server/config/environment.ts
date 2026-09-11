/**
 * Centralized Environment & Runtime Configuration Contract (UPG-001)
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

/**
 * Validates the runtime configuration against environment policies.
 * Fail-closed: Throws on any contract violation in staging or production.
 */
export function validateEnvironment(env: NodeJS.ProcessEnv = process.env): ValidatedConfig {
  const nodeEnv = (env.NODE_ENV || 'development').trim();
  
  // Resolve DEPLOY_ENV with fallback to NODE_ENV mapping
  let rawDeployEnv = env.DEPLOY_ENV ? env.DEPLOY_ENV.trim().toLowerCase() : undefined;
  if (!rawDeployEnv) {
    if (nodeEnv === 'production') {
      rawDeployEnv = 'production';
    } else if (nodeEnv === 'test') {
      rawDeployEnv = 'test';
    } else {
      rawDeployEnv = 'development';
    }
  }

  const validEnvs: DeployEnvironment[] = ['development', 'test', 'staging', 'production'];
  if (!validEnvs.includes(rawDeployEnv as DeployEnvironment)) {
    throw new Error(`[AbaCha Config Fatal] Invalid DEPLOY_ENV "${rawDeployEnv}". Must be one of: ${validEnvs.join(', ')}`);
  }

  const deployEnv = rawDeployEnv as DeployEnvironment;
  const isProduction = deployEnv === 'production' || nodeEnv === 'production';
  const isStaging = deployEnv === 'staging';
  const isTest = deployEnv === 'test' || nodeEnv === 'test';
  const isDevelopment = deployEnv === 'development' && nodeEnv !== 'production';

  // 1. Port Validation
  const portStr = env.PORT ? env.PORT.trim() : '3000';
  const port = parseInt(portStr, 10);
  if (isNaN(port) || port < 1 || port > 65535) {
    throw new Error(`[AbaCha Config Fatal] PORT must be a valid integer between 1 and 65535. Received: "${portStr}"`);
  }

  // 2. Production & Staging Persistence Requirements
  const dbUrl = env.DATABASE_URL?.trim();
  const pgHost = env.PGHOST?.trim();

  if (isProduction || isStaging) {
    if (!dbUrl && !pgHost) {
      throw new Error('[AbaCha Config Fatal] Production environment requires a valid PostgreSQL configuration (DATABASE_URL or PGHOST is missing).');
    }

    // 3. JWT Secret Mandate
    const jwtSecret = env.JWT_SECRET?.trim();
    if (!jwtSecret) {
      throw new Error('[AbaCha Config Fatal] JWT_SECRET environment variable is mandatory in production.');
    }
    const lowerSecret = jwtSecret.toLowerCase();
    if (jwtSecret.length < 32 || lowerSecret.includes('dev') || lowerSecret.includes('default')) {
      throw new Error('[AbaCha Config Fatal] Production JWT_SECRET must be a high-entropy string of at least 32 characters.');
    }

    // 4. Staging vs Production Environment Separation Contract (UPG-001)
    if (isStaging) {
      if (env.PRODUCTION_DATABASE_URL && dbUrl && dbUrl === env.PRODUCTION_DATABASE_URL) {
        throw new Error('[AbaCha Config Fatal] Cross-environment violation: Staging environment cannot use production database.');
      }
      if (env.APP_URL && env.APP_URL.includes('abacha-app.onrender.com')) {
        throw new Error('[AbaCha Config Fatal] Cross-environment violation: Staging APP_URL cannot target production domain.');
      }
    }

    if (isProduction) {
      if (env.STAGING_DATABASE_URL && dbUrl && dbUrl === env.STAGING_DATABASE_URL) {
        throw new Error('[AbaCha Config Fatal] Cross-environment violation: Production environment cannot use staging database.');
      }
    }

    // 5. APP_URL HTTPS Validation in Production & Staging
    if (env.APP_URL) {
      const appUrl = env.APP_URL.trim();
      if (!appUrl.startsWith('https://')) {
        throw new Error(`[AbaCha Config Fatal] APP_URL must use secure HTTPS protocol in ${deployEnv}. Received non-https URL.`);
      }

      // Ensure staging does not use production APP_URL and vice-versa
      if (isStaging && appUrl.includes('abacha-app.onrender.com')) {
        throw new Error('[AbaCha Config Fatal] Cross-environment violation: Staging APP_URL cannot target production domain.');
      }
    }
  }

  return {
    deployEnv,
    nodeEnv,
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
      const valid = val.length >= 32 && !val.includes('dev') && !val.includes('default');
      return { name, configured: true, status: valid ? 'VALID' : 'INVALID', note: valid ? 'High Entropy' : 'Weak or Short' };
    }
    if (name === 'PORT') {
      const p = parseInt(val, 10);
      const valid = !isNaN(p) && p >= 1 && p <= 65535;
      return { name, configured: true, status: valid ? 'VALID' : 'INVALID' };
    }
    if (name === 'APP_URL') {
      const valid = val.startsWith('https://') || val.startsWith('http://localhost');
      return { name, configured: true, status: valid ? 'VALID' : 'INVALID' };
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
