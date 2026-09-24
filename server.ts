import express from 'express';
import path from 'path';
import { pgClient, txStorage, isStandardPostgres, dbInfo } from './src/db/index.ts';
import { checkInstallationStatus } from './src/server/routes/installRoutes.ts';
import { ensureDatabaseSchema } from './src/db/schemaInit.ts';

import authRoutes from './src/server/routes/authRoutes.ts';
import productRoutes from './src/server/routes/productRoutes.ts';
import posRoutes from './src/server/routes/posRoutes.ts';
import purchaseRoutes from './src/server/routes/purchaseRoutes.ts';
import purchaseReturnRoutes from './src/server/routes/purchaseReturnRoutes.ts';
import returnRoutes from './src/server/routes/returnRoutes.ts';
import customerRoutes from './src/server/routes/customerRoutes.ts';
import supplierRoutes from './src/server/routes/supplierRoutes.ts';
import inventoryRoutes from './src/server/routes/inventoryRoutes.ts';
import brandCategoryRoutes from './src/server/routes/brandCategoryRoutes.ts';
import reportRoutes from './src/server/routes/reportRoutes.ts';
import settingsRoutes from './src/server/routes/settingsRoutes.ts';
import installRoutes from './src/server/routes/installRoutes.ts';
import backupRoutes from './src/server/routes/backupRoutes.ts';
import notificationRoutes from './src/server/routes/notificationRoutes.ts';

const app = express();
const PORT = 3000;

// Body parser with support for image data and full database backups
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Transaction context middleware: Ensures queries within a BEGIN/COMMIT block run on a single dedicated client
app.use((_req, res, next) => {
  const txContext: { client: any } = { client: null };
  txStorage.run(txContext, () => {
    let cleanedUp = false;
    const cleanup = () => {
      if (cleanedUp) return;
      cleanedUp = true;
      if (txContext.client) {
        const client = txContext.client;
        txContext.client = null;
        try {
          client.query('ROLLBACK').catch(() => {}).finally(() => {
            try {
              client.release(true); // Discard transaction client to avoid leaking dirty state to pool
            } catch (_) {}
          });
        } catch (_) {
          try {
            client.release(true);
          } catch (_) {}
        }
      }
    };

    res.on('finish', cleanup);
    res.on('close', cleanup);
    next();
  });
});

// Database connectivity verification on startup.
// CRITICAL REQUIREMENT: This NEVER automatically creates tables or seeds data on startup/dev/build.
// Tables are created ONLY when explicitly triggered by the UI Installation Wizard.
let isDbConnected = false;
export const dbInitPromise = (async () => {
  try {
    await pgClient.waitReady;
    console.log(`🚀 Database Engine: ${dbInfo.type} | Host: ${dbInfo.host}:${dbInfo.port} | Database: ${dbInfo.database}`);
    await pgClient.query('SELECT 1');
    isDbConnected = true;
    console.log('✅ PostgreSQL database connection verified. (Auto-table creation and auto-seeding disabled on startup).');
  } catch (dbErr: any) {
    console.error('❌ Database connection error on startup:', dbErr?.message || dbErr);
  }
})();

// Middleware to ensure DB connection is ready before processing requests
app.use(async (_req, _res, next) => {
  try {
    if (!isDbConnected) {
      await Promise.race([
        dbInitPromise,
        new Promise((resolve) => setTimeout(resolve, 2500)),
      ]);
    }
  } catch (_) {}
  next();
});

// Mount API Endpoints FIRST
const healthHandler = async (_req: any, res: any) => {
  try {
    await Promise.race([
      dbInitPromise,
      new Promise((resolve) => setTimeout(resolve, 2000)),
    ]);
  } catch (_) {}

  const installStatus = await checkInstallationStatus().catch(() => null);

  res.json({
    status: 'ok',
    service: 'Shoe Shop POS + Inventory System',
    database: dbInfo.type,
    isStandardPostgres,
    dbHost: dbInfo.host,
    dbPort: dbInfo.port,
    dbName: dbInfo.database,
    dbConnected: dbInfo.connected ?? false,
    isInstalled: installStatus?.isInstalled ?? false,
    dbLastError: dbInfo.lastError || null,
    environment: process.env.NODE_ENV || 'development',
    timestamp: new Date().toISOString(),
  });
};

app.get('/api/health', healthHandler);
app.get('/health', healthHandler);

// Register install routes first so they are always accessible
app.use('/api/install', installRoutes);
app.use('/install', installRoutes);

// Protected API Route Guard Middleware:
// If the application is not installed yet, API requests are blocked
// and instructed to complete the installation wizard at /installationWizard.
app.use(async (req, res, next) => {
  const reqPath = req.path;

  // Whitelisted health and installation endpoints
  if (
    reqPath.startsWith('/api/health') ||
    reqPath.startsWith('/health') ||
    reqPath.startsWith('/api/install') ||
    reqPath.startsWith('/install')
  ) {
    return next();
  }

  // Check if this request is targeting an API route
  const isApi = reqPath.startsWith('/api/') || [
    'auth', 'products', 'pos', 'purchases', 'purchase-returns',
    'returns', 'customers', 'suppliers', 'inventory',
    'brands-categories', 'reports', 'settings', 'backup', 'notifications', 'v1'
  ].some((prefix) => reqPath === `/${prefix}` || reqPath.startsWith(`/${prefix}/`));

  if (isApi) {
    try {
      const status = await checkInstallationStatus();
      if (!status.isInstalled) {
        return res.status(428).json({
          error: 'Application is not installed. Please complete the installation wizard at /installationWizard.',
          isInstalled: false,
          redirect: '/installationWizard',
        });
      }
    } catch (_) {
      return res.status(428).json({
        error: 'Application database is not ready or not installed.',
        isInstalled: false,
        redirect: '/installationWizard',
      });
    }
  }

  next();
});

// Register remaining application API routes
const apiRoutes: [string, any][] = [
  ['auth', authRoutes],
  ['products', productRoutes],
  ['pos', posRoutes],
  ['purchases', purchaseRoutes],
  ['purchase-returns', purchaseReturnRoutes],
  ['returns', returnRoutes],
  ['customers', customerRoutes],
  ['suppliers', supplierRoutes],
  ['inventory', inventoryRoutes],
  ['brands-categories', brandCategoryRoutes],
  ['reports', reportRoutes],
  ['settings', settingsRoutes],
  ['backup', backupRoutes],
  ['notifications', notificationRoutes],
];

for (const [routePath, router] of apiRoutes) {
  app.use(`/api/${routePath}`, router);
  app.use(`/${routePath}`, router);
}

// Dedicated endpoint to download Windows desktop setup (.exe)
app.get(['/download/exe', '/api/download/exe'], (_req, res) => {
  const exePath = path.join(process.cwd(), 'public', 'assets', 'StepSync-POS-Desktop-Setup.exe');
  res.download(exePath, 'StepSync-POS-Desktop-Setup.exe', (err) => {
    if (err && !res.headersSent) {
      res.status(404).json({ error: 'Executable setup file not found' });
    }
  });
});

// Dedicated endpoint to download Android APK file (.apk)
app.get(['/download/apk', '/api/download/apk', '/assets/StepSync-POS.apk', '/assets/StepSync-POS-Android.apk'], (_req, res) => {
  const apkPath = path.join(process.cwd(), 'public', 'assets', 'StepSync-POS.apk');
  res.setHeader('Content-Type', 'application/vnd.android.package-archive');
  res.download(apkPath, 'StepSync-POS.apk', (err) => {
    if (err && !res.headersSent) {
      res.status(404).json({ error: 'Android APK setup file not found' });
    }
  });
});

// Server startup for containerized environment (e.g. Cloud Run)
async function setupFrontendAndListen() {
  // Ensure all database tables, columns, and indexes are in place
  try {
    const status = await checkInstallationStatus().catch(() => ({ isInstalled: false }));
    if (status.isInstalled) {
      await ensureDatabaseSchema();
    }
  } catch (err: any) {
    console.warn('Notice: Background schema check skipped:', err?.message);
  }

  // Vite middleware for local development
  if (process.env.NODE_ENV !== 'production') {
    try {
      const { createServer: createViteServer } = await import('vite');
      const isHmrDisabled = process.env.DISABLE_HMR === 'true';
      const vite = await createViteServer({
        server: {
          middlewareMode: true,
          hmr: isHmrDisabled ? false : undefined,
          watch: isHmrDisabled ? null : undefined,
        },
        appType: 'spa',
      });
      app.use(vite.middlewares);
    } catch (viteErr) {
      console.warn('Vite dev server middleware could not be loaded:', viteErr);
    }
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // Bind to port 3000 and 0.0.0.0 for container ingress routing
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Shoe Shop POS Server running on port ${PORT}`);
  });
}

setupFrontendAndListen();

export default app;
export { app };
