import mysql from 'mysql2/promise';
import fs from 'fs';
import path from 'path';

// Safely load .env and .env.local if not already in process.env, prioritizing .env.production in production
function loadEnvFiles() {
  const isProd = process.env.NODE_ENV === 'production' || fs.existsSync(path.resolve(/*turbopackIgnore: true*/ process.cwd(), '.env.production'));
  const envFiles = isProd 
    ? ['.env.production', '.env.local', '.env'] 
    : ['.env.local', '.env', '.env.production'];
  for (const file of envFiles) {
    try {
      const fullPath = path.resolve(/*turbopackIgnore: true*/ process.cwd(), file);
      if (fs.existsSync(fullPath)) {
        const content = fs.readFileSync(fullPath, 'utf8');
        for (const line of content.split('\n')) {
          const trimmed = line.trim();
          if (trimmed && !trimmed.startsWith('#') && !trimmed.startsWith('//') && trimmed.includes('=')) {
            const firstEq = trimmed.indexOf('=');
            const key = trimmed.slice(0, firstEq).trim();
            let val = trimmed.slice(firstEq + 1).trim();
            if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
              val = val.slice(1, -1);
            }
            if (!process.env[key]) {
              process.env[key] = val;
            }
          }
        }
      }
    } catch {}
  }
}

loadEnvFiles();

// Helper to parse DATABASE_URL or environment variables safely
function getDbConfig(): mysql.PoolOptions {
  const url = process.env.DATABASE_URL;
  if (url && (url.startsWith('mysql://') || url.startsWith('mysql2://'))) {
    const withoutScheme = url.replace(/^mysql2?:\/\//, '');
    const lastAtIdx = withoutScheme.lastIndexOf('@');
    if (lastAtIdx !== -1) {
      const userPassPart = withoutScheme.slice(0, lastAtIdx);
      const hostDbPart = withoutScheme.slice(lastAtIdx + 1);

      const firstColonIdx = userPassPart.indexOf(':');
      const user = firstColonIdx !== -1 ? userPassPart.slice(0, firstColonIdx) : userPassPart;
      const rawPass = firstColonIdx !== -1 ? userPassPart.slice(firstColonIdx + 1) : '';
      const password = decodeURIComponent(rawPass);

      const [hostPort, dbAndParams] = hostDbPart.split('/');
      const [host, portStr] = hostPort.split(':');
      const database = dbAndParams?.split('?')[0];

      return {
        host: host || 'localhost',
        port: portStr ? parseInt(portStr, 10) : 3306,
        user: user || 'root',
        password: password || '',
        database: database || 'ateon_one',
        connectTimeout: 5000,
      };
    }
  }

  const rawHost = process.env.DB_HOST || 'localhost';
  return {
    host: rawHost,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'ateon_one',
    connectTimeout: 5000,
  };
}

const config = getDbConfig();

const globalForDb = globalThis as unknown as {
  pool: mysql.Pool | undefined;
};

export const pool = globalForDb.pool ?? mysql.createPool({
  ...config,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

if (process.env.NODE_ENV !== 'production') globalForDb.pool = pool;

const rawPoolQuery = pool.query.bind(pool);
let schemaInitialized = false;
let schemaInitPromise: Promise<void> | null = null;

/**
 * Add any columns that are missing from the live database.
 *
 * Reads the actual column list out of information_schema and issues an
 * `ALTER TABLE ... ADD COLUMN` only for the ones that aren't there, so this is
 * idempotent and safe to run on every boot. A failure on one table is logged
 * and skipped rather than aborting the whole schema init.
 */
async function ensureColumns(spec: Record<string, Record<string, string>>) {
  for (const [table, columns] of Object.entries(spec)) {
    try {
      const [existing] = await rawPoolQuery<any[]>(
        `SELECT COLUMN_NAME FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
        [table]
      );
      // Table doesn't exist at all — the CREATE TABLE above already handles it.
      if (existing.length === 0) continue;

      const present = new Set(existing.map((r: any) => String(r.COLUMN_NAME).toLowerCase()));
      const missing = Object.entries(columns).filter(([name]) => !present.has(name.toLowerCase()));
      if (missing.length === 0) continue;

      const clauses = missing.map(([name, def]) => `ADD COLUMN \`${name}\` ${def}`).join(', ');
      await rawPoolQuery(`ALTER TABLE \`${table}\` ${clauses};`);
      console.log(`[schema] ${table}: added ${missing.map(([n]) => n).join(', ')}`);
    } catch (e) {
      console.error(`[schema] column reconciliation failed for ${table}:`, e);
    }
  }
}

async function ensureSchemaInit() {
  if (schemaInitialized) return;
  if (!schemaInitPromise) {
    schemaInitPromise = (async () => {
      try {
        await rawPoolQuery(`CREATE TABLE IF NOT EXISTS \`User\` (
          \`id\` VARCHAR(191) NOT NULL,
          \`name\` VARCHAR(191) NOT NULL,
          \`email\` VARCHAR(191) NOT NULL,
          \`passwordHash\` VARCHAR(191) NOT NULL,
          \`role\` VARCHAR(191) NOT NULL,
          \`department\` VARCHAR(191) NOT NULL,
          \`designation\` VARCHAR(191) NOT NULL,
          \`avatar\` VARCHAR(191) NOT NULL,
          \`phone\` VARCHAR(191) NULL,
          \`twoFactorEnabled\` BOOLEAN NOT NULL DEFAULT FALSE,
          \`twoFactorSecret\` VARCHAR(191) NULL,
          \`notifEmail\` BOOLEAN NOT NULL DEFAULT TRUE,
          \`notifPush\` BOOLEAN NOT NULL DEFAULT TRUE,
          \`notifLeave\` BOOLEAN NOT NULL DEFAULT TRUE,
          \`notifApproval\` BOOLEAN NOT NULL DEFAULT TRUE,
          \`notifChat\` BOOLEAN NOT NULL DEFAULT TRUE,
          \`displayCompact\` BOOLEAN NOT NULL DEFAULT FALSE,
          \`displayAnimations\` BOOLEAN NOT NULL DEFAULT TRUE,
          \`createdAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          \`updatedAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (\`id\`),
          UNIQUE INDEX \`User_email_key\` (\`email\`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`);

        await rawPoolQuery(`CREATE TABLE IF NOT EXISTS \`Session\` (
          \`id\` VARCHAR(191) NOT NULL,
          \`userId\` VARCHAR(191) NOT NULL,
          \`token\` VARCHAR(512) NOT NULL,
          \`expiresAt\` DATETIME NOT NULL,
          \`createdAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (\`id\`),
          UNIQUE INDEX \`Session_token_key\` (\`token\`),
          INDEX \`Session_userId_idx\` (\`userId\`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`);

        await rawPoolQuery(`CREATE TABLE IF NOT EXISTS \`Department\` (
          \`id\` VARCHAR(191) NOT NULL,
          \`name\` VARCHAR(191) NOT NULL,
          \`head\` VARCHAR(191) NULL,
          \`parentId\` VARCHAR(191) NULL,
          \`headEmployeeId\` VARCHAR(191) NULL,
          \`createdAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          \`updatedAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (\`id\`),
          UNIQUE INDEX \`Department_name_key\` (\`name\`),
          INDEX \`Department_parentId_idx\` (\`parentId\`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`);

        // Customisable roles. Seeded from the built-in set on first boot, then
        // owned by the org — the CEO can add roles and change module access
        // without a code change.
        await rawPoolQuery(`CREATE TABLE IF NOT EXISTS \`Role\` (
          \`id\` VARCHAR(191) NOT NULL,
          \`key\` VARCHAR(191) NOT NULL,
          \`label\` VARCHAR(191) NOT NULL,
          \`description\` VARCHAR(191) NOT NULL DEFAULT '',
          \`color\` VARCHAR(191) NOT NULL DEFAULT '#94A3B8',
          \`modules\` TEXT NOT NULL,
          \`rank\` INT NOT NULL DEFAULT 100,
          \`isSystem\` BOOLEAN NOT NULL DEFAULT FALSE,
          \`createdAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          \`updatedAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (\`id\`),
          UNIQUE INDEX \`Role_key_key\` (\`key\`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`);

        await rawPoolQuery(`CREATE TABLE IF NOT EXISTS \`Employee\` (
          \`id\` VARCHAR(191) NOT NULL,
          \`name\` VARCHAR(191) NOT NULL,
          \`email\` VARCHAR(191) NOT NULL,
          \`phone\` VARCHAR(191) NULL,
          \`designation\` VARCHAR(191) NOT NULL,
          \`departmentId\` VARCHAR(191) NULL,
          \`location\` VARCHAR(191) NULL,
          \`joinDate\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          \`status\` VARCHAR(191) NOT NULL DEFAULT 'active',
          \`salary\` DOUBLE NULL,
          \`avatar\` VARCHAR(191) NOT NULL DEFAULT '',
          \`currentLat\` DOUBLE NULL,
          \`currentLng\` DOUBLE NULL,
          \`currentLocName\` VARCHAR(191) NULL,
          \`managerId\` VARCHAR(191) NULL,
          \`userId\` VARCHAR(191) NULL,
          \`createdAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          \`updatedAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (\`id\`),
          UNIQUE INDEX \`Employee_email_key\` (\`email\`),
          UNIQUE INDEX \`Employee_userId_key\` (\`userId\`),
          INDEX \`Employee_departmentId_idx\` (\`departmentId\`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`);

        await rawPoolQuery(`CREATE TABLE IF NOT EXISTS \`Attendance\` (
          \`id\` VARCHAR(191) NOT NULL,
          \`employeeId\` VARCHAR(191) NOT NULL,
          \`date\` DATE NOT NULL,
          \`status\` VARCHAR(191) NOT NULL DEFAULT 'present',
          \`checkIn\` VARCHAR(191) NULL,
          \`checkOut\` VARCHAR(191) NULL,
          \`onBreakSince\` VARCHAR(191) NULL,
          \`breakSeconds\` INT NOT NULL DEFAULT 0,
          \`createdAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (\`id\`),
          UNIQUE INDEX \`Attendance_employeeId_date_key\` (\`employeeId\`, \`date\`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`);

        await rawPoolQuery(`CREATE TABLE IF NOT EXISTS \`LeaveRequest\` (
          \`id\` VARCHAR(191) NOT NULL,
          \`employeeId\` VARCHAR(191) NOT NULL,
          \`type\` VARCHAR(191) NOT NULL,
          \`startDate\` DATETIME NOT NULL,
          \`endDate\` DATETIME NOT NULL,
          \`days\` DOUBLE NOT NULL,
          \`reason\` TEXT NOT NULL,
          \`status\` VARCHAR(191) NOT NULL DEFAULT 'pending',
          \`approverId\` VARCHAR(191) NULL,
          \`decidedAt\` DATETIME NULL,
          \`createdAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (\`id\`),
          INDEX \`LeaveRequest_employeeId_idx\` (\`employeeId\`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`);

        await rawPoolQuery(`CREATE TABLE IF NOT EXISTS \`PayrollRun\` (
          \`id\` VARCHAR(191) NOT NULL,
          \`month\` VARCHAR(191) NOT NULL,
          \`status\` VARCHAR(191) NOT NULL DEFAULT 'draft',
          \`totalGross\` DOUBLE NOT NULL DEFAULT 0,
          \`totalNet\` DOUBLE NOT NULL DEFAULT 0,
          \`headcount\` INT NOT NULL DEFAULT 0,
          \`processedAt\` DATETIME NULL,
          \`createdAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          \`updatedAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (\`id\`),
          UNIQUE INDEX \`PayrollRun_month_key\` (\`month\`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`);

        try { await rawPoolQuery(`ALTER TABLE \`PayrollRun\` ADD COLUMN \`updatedAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`); } catch {}

        await rawPoolQuery(`CREATE TABLE IF NOT EXISTS \`Payslip\` (
          \`id\` VARCHAR(191) NOT NULL,
          \`employeeId\` VARCHAR(191) NOT NULL,
          \`month\` VARCHAR(191) NOT NULL,
          \`basic\` DOUBLE NOT NULL,
          \`hra\` DOUBLE NOT NULL,
          \`da\` DOUBLE NOT NULL,
          \`special\` DOUBLE NOT NULL,
          \`pf\` DOUBLE NOT NULL,
          \`tax\` DOUBLE NOT NULL,
          \`gross\` DOUBLE NOT NULL,
          \`deductions\` DOUBLE NOT NULL,
          \`net\` DOUBLE NOT NULL,
          \`createdAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (\`id\`),
          INDEX \`Payslip_employeeId_idx\` (\`employeeId\`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`);

        await rawPoolQuery(`CREATE TABLE IF NOT EXISTS \`Budget\` (
          \`id\` VARCHAR(191) NOT NULL,
          \`department\` VARCHAR(191) NOT NULL,
          \`category\` VARCHAR(191) NOT NULL,
          \`fiscalYear\` VARCHAR(191) NOT NULL,
          \`allocated\` DOUBLE NOT NULL,
          \`spent\` DOUBLE NOT NULL DEFAULT 0,
          \`status\` VARCHAR(191) NOT NULL DEFAULT 'on-track',
          \`createdAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          \`updatedAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (\`id\`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`);

        await rawPoolQuery(`CREATE TABLE IF NOT EXISTS \`Expense\` (
          \`id\` VARCHAR(191) NOT NULL,
          \`description\` VARCHAR(191) NOT NULL,
          \`category\` VARCHAR(191) NOT NULL,
          \`amount\` DOUBLE NOT NULL,
          \`currency\` VARCHAR(191) NOT NULL DEFAULT 'INR',
          \`date\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          \`vendor\` VARCHAR(191) NULL,
          \`submittedById\` VARCHAR(191) NULL,
          \`submittedBy\` VARCHAR(191) NULL,
          \`status\` VARCHAR(191) NOT NULL DEFAULT 'pending',
          \`receiptUrl\` VARCHAR(191) NULL,
          \`createdAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          \`updatedAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (\`id\`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`);

        await rawPoolQuery(`CREATE TABLE IF NOT EXISTS \`Invoice\` (
          \`id\` VARCHAR(191) NOT NULL,
          \`number\` VARCHAR(191) NOT NULL,
          \`clientName\` VARCHAR(191) NOT NULL,
          \`amount\` DOUBLE NOT NULL,
          \`currency\` VARCHAR(191) NOT NULL DEFAULT 'INR',
          \`issueDate\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          \`dueDate\` DATETIME NOT NULL,
          \`paidAt\` DATETIME NULL,
          \`status\` VARCHAR(191) NOT NULL DEFAULT 'draft',
          \`items\` JSON NULL,
          \`notes\` TEXT NULL,
          \`createdAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          \`updatedAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (\`id\`),
          UNIQUE INDEX \`Invoice_number_key\` (\`number\`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`);

        await rawPoolQuery(`CREATE TABLE IF NOT EXISTS \`MarketingCampaign\` (
          \`id\` VARCHAR(191) NOT NULL,
          \`name\` VARCHAR(191) NOT NULL,
          \`channel\` VARCHAR(191) NOT NULL,
          \`objective\` VARCHAR(191) NULL,
          \`status\` VARCHAR(191) NOT NULL DEFAULT 'planned',
          \`budget\` DOUBLE NOT NULL DEFAULT 0,
          \`startDate\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          \`endDate\` DATETIME NULL,
          \`ownerId\` VARCHAR(191) NULL,
          \`createdAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          \`updatedAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (\`id\`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`);

        await rawPoolQuery(`CREATE TABLE IF NOT EXISTS \`MarketingSpend\` (
          \`id\` VARCHAR(191) NOT NULL,
          \`campaignId\` VARCHAR(191) NOT NULL,
          \`date\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          \`amount\` DOUBLE NOT NULL,
          \`description\` VARCHAR(191) NULL,
          \`impressions\` INT NOT NULL DEFAULT 0,
          \`clicks\` INT NOT NULL DEFAULT 0,
          \`conversions\` INT NOT NULL DEFAULT 0,
          \`createdAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (\`id\`),
          INDEX \`MarketingSpend_campaignId_idx\` (\`campaignId\`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`);

        await rawPoolQuery(`CREATE TABLE IF NOT EXISTS \`Project\` (
          \`id\` VARCHAR(191) NOT NULL,
          \`name\` VARCHAR(191) NOT NULL,
          \`description\` TEXT NULL,
          \`status\` VARCHAR(191) NOT NULL DEFAULT 'active',
          \`health\` VARCHAR(191) NOT NULL DEFAULT 'green',
          \`progress\` INT NOT NULL DEFAULT 0,
          \`startDate\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          \`endDate\` DATETIME NULL,
          \`ownerId\` VARCHAR(191) NULL,
          \`attachments\` LONGTEXT NULL,
          \`createdAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          \`updatedAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (\`id\`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`);

        await rawPoolQuery(`CREATE TABLE IF NOT EXISTS \`Task\` (
          \`id\` VARCHAR(191) NOT NULL,
          \`title\` VARCHAR(191) NOT NULL,
          \`description\` TEXT NOT NULL,
          \`projectId\` VARCHAR(191) NULL,
          \`assigneeId\` VARCHAR(191) NOT NULL,
          \`status\` VARCHAR(191) NOT NULL,
          \`priority\` VARCHAR(191) NOT NULL,
          \`dueDate\` DATETIME NOT NULL,
          \`tags\` VARCHAR(191) NOT NULL DEFAULT '[]',
          \`createdAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          \`updatedAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (\`id\`),
          INDEX \`Task_assigneeId_idx\` (\`assigneeId\`),
          INDEX \`Task_projectId_idx\` (\`projectId\`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`);

        await rawPoolQuery(`CREATE TABLE IF NOT EXISTS \`Lead\` (
          \`id\` VARCHAR(191) NOT NULL,
          \`name\` VARCHAR(191) NOT NULL,
          \`company\` VARCHAR(191) NULL,
          \`email\` VARCHAR(191) NULL,
          \`phone\` VARCHAR(191) NULL,
          \`source\` VARCHAR(191) NULL,
          \`status\` VARCHAR(191) NOT NULL DEFAULT 'new',
          \`estimatedValue\` DOUBLE NOT NULL DEFAULT 0,
          \`score\` INT NOT NULL DEFAULT 50,
          \`industry\` VARCHAR(191) NULL,
          \`lastActivity\` DATETIME NULL,
          \`ownerId\` VARCHAR(191) NULL,
          \`notes\` TEXT NULL,
          \`createdAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          \`updatedAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (\`id\`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`);

        await rawPoolQuery(`CREATE TABLE IF NOT EXISTS \`Contact\` (
          \`id\` VARCHAR(191) NOT NULL,
          \`name\` VARCHAR(191) NOT NULL,
          \`email\` VARCHAR(191) NULL,
          \`phone\` VARCHAR(191) NULL,
          \`company\` VARCHAR(191) NULL,
          \`title\` VARCHAR(191) NULL,
          \`leadId\` VARCHAR(191) NULL,
          \`createdAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          \`updatedAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (\`id\`),
          INDEX \`Contact_leadId_idx\` (\`leadId\`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`);

        await rawPoolQuery(`CREATE TABLE IF NOT EXISTS \`Vendor\` (
          \`id\` VARCHAR(191) NOT NULL,
          \`name\` VARCHAR(191) NOT NULL,
          \`category\` VARCHAR(191) NOT NULL DEFAULT 'general',
          \`contact\` VARCHAR(191) NULL,
          \`email\` VARCHAR(191) NULL,
          \`phone\` VARCHAR(191) NULL,
          \`rating\` DOUBLE NOT NULL DEFAULT 0,
          \`totalOrders\` INT NOT NULL DEFAULT 0,
          \`status\` VARCHAR(191) NOT NULL DEFAULT 'active',
          \`notes\` TEXT NULL,
          \`createdAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          \`updatedAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (\`id\`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`);

        await rawPoolQuery(`CREATE TABLE IF NOT EXISTS \`PurchaseRequest\` (
          \`id\` VARCHAR(191) NOT NULL,
          \`title\` VARCHAR(191) NOT NULL,
          \`description\` TEXT NULL,
          \`amount\` DOUBLE NOT NULL DEFAULT 0,
          \`currency\` VARCHAR(191) NOT NULL DEFAULT 'INR',
          \`urgency\` VARCHAR(191) NOT NULL DEFAULT 'normal',
          \`status\` VARCHAR(191) NOT NULL DEFAULT 'pending',
          \`vendorId\` VARCHAR(191) NULL,
          \`requesterId\` VARCHAR(191) NULL,
          \`requestedBy\` VARCHAR(191) NOT NULL,
          \`decidedBy\` VARCHAR(191) NULL,
          \`decidedAt\` DATETIME NULL,
          \`createdAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          \`updatedAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (\`id\`),
          INDEX \`PurchaseRequest_vendorId_idx\` (\`vendorId\`),
          INDEX \`PurchaseRequest_status_idx\` (\`status\`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`);

        await rawPoolQuery(`CREATE TABLE IF NOT EXISTS \`InventoryItem\` (
          \`id\` VARCHAR(191) NOT NULL,
          \`name\` VARCHAR(191) NOT NULL,
          \`sku\` VARCHAR(191) NULL,
          \`category\` VARCHAR(191) NOT NULL DEFAULT 'general',
          \`quantity\` INT NOT NULL DEFAULT 0,
          \`reorderLevel\` INT NOT NULL DEFAULT 0,
          \`unitCost\` DOUBLE NOT NULL DEFAULT 0,
          \`location\` VARCHAR(191) NULL,
          \`createdAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          \`updatedAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (\`id\`),
          UNIQUE INDEX \`InventoryItem_sku_key\` (\`sku\`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`);

        await rawPoolQuery(`CREATE TABLE IF NOT EXISTS \`Account\` (
          \`id\` VARCHAR(191) NOT NULL,
          \`name\` VARCHAR(191) NOT NULL,
          \`industry\` VARCHAR(191) NULL,
          \`type\` VARCHAR(191) NOT NULL DEFAULT 'prospect',
          \`website\` VARCHAR(191) NULL,
          \`revenue\` DOUBLE NOT NULL DEFAULT 0,
          \`employeeCount\` INT NOT NULL DEFAULT 0,
          \`phone\` VARCHAR(191) NULL,
          \`email\` VARCHAR(191) NULL,
          \`address\` TEXT NULL,
          \`ownerId\` VARCHAR(191) NULL,
          \`status\` VARCHAR(191) NOT NULL DEFAULT 'active',
          \`lastActivity\` DATETIME NULL,
          \`createdAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          \`updatedAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (\`id\`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`);

        await rawPoolQuery(`CREATE TABLE IF NOT EXISTS \`Opportunity\` (
          \`id\` VARCHAR(191) NOT NULL,
          \`name\` VARCHAR(191) NOT NULL,
          \`accountId\` VARCHAR(191) NULL,
          \`stage\` VARCHAR(191) NOT NULL DEFAULT 'prospecting',
          \`amount\` DOUBLE NOT NULL DEFAULT 0,
          \`probability\` INT NOT NULL DEFAULT 0,
          \`closeDate\` DATETIME NULL,
          \`ownerId\` VARCHAR(191) NULL,
          \`type\` VARCHAR(191) NOT NULL DEFAULT 'new-business',
          \`source\` VARCHAR(191) NULL,
          \`nextStep\` VARCHAR(191) NULL,
          \`description\` TEXT NULL,
          \`createdAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          \`updatedAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (\`id\`),
          INDEX \`Opportunity_accountId_idx\` (\`accountId\`),
          INDEX \`Opportunity_stage_idx\` (\`stage\`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`);

        await rawPoolQuery(`CREATE TABLE IF NOT EXISTS \`Approval\` (
          \`id\` VARCHAR(191) NOT NULL,
          \`title\` VARCHAR(191) NOT NULL,
          \`type\` VARCHAR(191) NOT NULL,
          \`requestedBy\` VARCHAR(191) NOT NULL,
          \`amount\` DOUBLE NULL,
          \`priority\` VARCHAR(191) NOT NULL DEFAULT 'medium',
          \`status\` VARCHAR(191) NOT NULL DEFAULT 'pending',
          \`currentStep\` VARCHAR(191) NULL,
          \`decidedBy\` VARCHAR(191) NULL,
          \`decidedAt\` DATETIME NULL,
          \`createdAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          \`updatedAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (\`id\`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`);

        await rawPoolQuery(`CREATE TABLE IF NOT EXISTS \`AuditLog\` (
          \`id\` VARCHAR(191) NOT NULL,
          \`actorId\` VARCHAR(191) NULL,
          \`actorName\` VARCHAR(191) NOT NULL,
          \`action\` VARCHAR(191) NOT NULL,
          \`entity\` VARCHAR(191) NOT NULL,
          \`entityId\` VARCHAR(191) NULL,
          \`details\` TEXT NULL,
          \`ipAddress\` VARCHAR(191) NULL,
          \`createdAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (\`id\`),
          INDEX \`AuditLog_entity_idx\` (\`entity\`),
          INDEX \`AuditLog_createdAt_idx\` (\`createdAt\`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`);

        await rawPoolQuery(`CREATE TABLE IF NOT EXISTS \`ServiceTicket\` (
          \`id\` VARCHAR(191) NOT NULL,
          \`subject\` VARCHAR(191) NOT NULL,
          \`description\` TEXT NOT NULL,
          \`category\` VARCHAR(191) NOT NULL DEFAULT 'general',
          \`priority\` VARCHAR(191) NOT NULL DEFAULT 'medium',
          \`status\` VARCHAR(191) NOT NULL DEFAULT 'open',
          \`reportedBy\` VARCHAR(191) NOT NULL,
          \`assignedTo\` VARCHAR(191) NULL,
          \`slaDeadline\` DATETIME NULL,
          \`createdAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          \`updatedAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (\`id\`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`);

        await rawPoolQuery(`CREATE TABLE IF NOT EXISTS \`CalendarEvent\` (
          \`id\` VARCHAR(191) NOT NULL,
          \`title\` VARCHAR(191) NOT NULL,
          \`type\` VARCHAR(191) NOT NULL DEFAULT 'meeting',
          \`date\` DATETIME NOT NULL,
          \`startTime\` VARCHAR(191) NULL,
          \`endTime\` VARCHAR(191) NULL,
          \`location\` VARCHAR(191) NULL,
          \`attendees\` JSON NULL,
          \`createdById\` VARCHAR(191) NULL,
          \`createdAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          \`updatedAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (\`id\`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`);

        await rawPoolQuery(`CREATE TABLE IF NOT EXISTS \`Document\` (
          \`id\` VARCHAR(191) NOT NULL,
          \`name\` VARCHAR(191) NOT NULL,
          \`category\` VARCHAR(191) NOT NULL DEFAULT 'general',
          \`url\` VARCHAR(191) NOT NULL,
          \`mimeType\` VARCHAR(191) NULL,
          \`size\` INT NULL,
          \`uploadedById\` VARCHAR(191) NULL,
          \`createdAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (\`id\`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`);

        await rawPoolQuery(`CREATE TABLE IF NOT EXISTS \`Setting\` (
          \`id\` VARCHAR(191) NOT NULL,
          \`key\` VARCHAR(191) NOT NULL,
          \`value\` TEXT NOT NULL,
          \`createdAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          \`updatedAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (\`id\`),
          UNIQUE INDEX \`Setting_key_key\` (\`key\`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`);

        try { await rawPoolQuery(`ALTER TABLE \`Setting\` ADD COLUMN \`createdAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP`); } catch {}

        await rawPoolQuery(`CREATE TABLE IF NOT EXISTS \`AppState\` (
          \`id\` VARCHAR(191) NOT NULL,
          \`key\` VARCHAR(191) NOT NULL,
          \`data\` JSON NOT NULL,
          \`createdAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          \`updatedAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (\`id\`),
          UNIQUE INDEX \`AppState_key_key\` (\`key\`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`);

        try { await rawPoolQuery(`ALTER TABLE \`AppState\` ADD COLUMN \`createdAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP`); } catch {}

        await rawPoolQuery(`CREATE TABLE IF NOT EXISTS \`ChatGroup\` (
          \`id\` VARCHAR(191) NOT NULL,
          \`name\` VARCHAR(191) NOT NULL,
          \`type\` VARCHAR(191) NOT NULL DEFAULT 'team',
          \`createdAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          \`updatedAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (\`id\`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`);

        await rawPoolQuery(`CREATE TABLE IF NOT EXISTS \`ChatMember\` (
          \`id\` VARCHAR(191) NOT NULL,
          \`groupId\` VARCHAR(191) NOT NULL,
          \`userId\` VARCHAR(191) NOT NULL,
          \`joinedAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          \`lastRead\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (\`id\`),
          UNIQUE INDEX \`ChatMember_groupId_userId_key\` (\`groupId\`, \`userId\`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`);

        await rawPoolQuery(`CREATE TABLE IF NOT EXISTS \`ChatMessage\` (
          \`id\` VARCHAR(191) NOT NULL,
          \`groupId\` VARCHAR(191) NOT NULL,
          \`senderId\` VARCHAR(191) NOT NULL,
          \`content\` TEXT NOT NULL,
          \`fileUrl\` LONGTEXT NULL,
          \`fileType\` VARCHAR(191) NULL,
          \`timestamp\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (\`id\`),
          INDEX \`ChatMessage_groupId_idx\` (\`groupId\`),
          INDEX \`ChatMessage_senderId_idx\` (\`senderId\`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`);

        // ── Column reconciliation ──
        // `CREATE TABLE IF NOT EXISTS` above is a no-op on databases that already
        // exist, so columns added to the schema after a deploy never appear on the
        // live DB. MySQL has no `ADD COLUMN IF NOT EXISTS`, so diff against
        // information_schema and add whatever is missing. Safe to re-run.
        await ensureColumns({
          User: {
            phone: 'VARCHAR(191) NULL',
          },
          Lead: {
            score: 'INT NOT NULL DEFAULT 50',
            industry: 'VARCHAR(191) NULL',
            lastActivity: 'DATETIME NULL',
          },
          Department: {
            parentId: 'VARCHAR(191) NULL',
            headEmployeeId: 'VARCHAR(191) NULL',
          },
          Employee: {
            currentLat: 'DOUBLE NULL',
            currentLng: 'DOUBLE NULL',
            currentLocName: 'VARCHAR(191) NULL',
          },
          Attendance: {
            onBreakSince: 'VARCHAR(191) NULL',
            breakSeconds: 'INT NOT NULL DEFAULT 0',
          },
          Project: {
            attachments: 'LONGTEXT NULL',
          },
          ChatMessage: {
            fileUrl: 'LONGTEXT NULL',
            fileType: 'VARCHAR(191) NULL',
          },
        });

        // Optional first-run bootstrap account.
        //
        // Previously this inserted a hardcoded user with a fabricated bcrypt
        // hash, producing an account that could never be logged into. Now it
        // only seeds when real credentials are supplied via environment
        // variables, and otherwise leaves the database alone.
        const seedEmail = process.env.SEED_ADMIN_EMAIL;
        const seedPassword = process.env.SEED_ADMIN_PASSWORD;
        if (seedEmail && seedPassword) {
          const [existing] = await rawPoolQuery<any[]>(`SELECT id FROM \`User\` WHERE email = ?`, [seedEmail]);
          if (existing.length === 0) {
            const bcrypt = require('bcryptjs');
            const hash = await bcrypt.hash(seedPassword, 10);
            await rawPoolQuery(
              `INSERT INTO \`User\` (\`id\`, \`name\`, \`email\`, \`passwordHash\`, \`role\`, \`department\`, \`designation\`, \`avatar\`, \`createdAt\`, \`updatedAt\`) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
              [
                'c' + Math.random().toString(36).slice(2, 11) + Date.now().toString(36),
                process.env.SEED_ADMIN_NAME || 'Administrator',
                seedEmail,
                hash,
                'ceo',
                'Executive Office',
                'Chief Executive Officer',
                '',
              ]
            );
            console.log(`[schema] seeded bootstrap account ${seedEmail}`);
          }
        }

        schemaInitialized = true;
      } catch (e) {
        console.error('Failed auto-creating schema:', e);
      }
    })();
  }
  await schemaInitPromise;
}

(pool as any).query = async function (sql: any, params?: any) {
  await ensureSchemaInit();
  return rawPoolQuery(sql, params);
};


// Helper to generate unique cuid-like IDs
function genId() {
  return 'c' + Math.random().toString(36).substring(2, 11) + Date.now().toString(36);
}

// Helper to format Date objects for MySQL queries if needed
function formatVal(v: any): any {
  if (v instanceof Date) {
    return v.toISOString().slice(0, 19).replace('T', ' ');
  }
  if (typeof v === 'object' && v !== null) {
    return JSON.stringify(v);
  }
  return v;
}

// Universal table delegate builder with overrides
function createDelegate(tableName: string, overrides: any = {}) {
  const base = {
    findUnique: async ({ where, include }: any = {}) => {
      if (overrides.findUnique) {
        return overrides.findUnique({ where, include });
      }
      const keys = Object.keys(where || {});
      if (keys.length === 0) return null;
      const conditions = keys.map(k => `\`${k}\` = ?`);
      const values = keys.map(k => formatVal(where[k]));
      const [rows] = await pool.query<any[]>(`SELECT * FROM \`${tableName}\` WHERE ${conditions.join(' AND ')} LIMIT 1`, values);
      const item = rows[0] || null;
      if (item && include && overrides._handleInclude) {
        await overrides._handleInclude([item], include);
      }
      return item;
    },
    findFirst: async ({ where, include }: any = {}) => {
      const keys = Object.keys(where || {});
      const conditions = keys.map(k => `\`${k}\` = ?`);
      const values = keys.map(k => formatVal(where[k]));
      const whereClause = conditions.length > 0 ? ` WHERE ${conditions.join(' AND ')}` : '';
      const [rows] = await pool.query<any[]>(`SELECT * FROM \`${tableName}\`${whereClause} LIMIT 1`, values);
      const item = rows[0] || null;
      if (item && include && overrides._handleInclude) {
        await overrides._handleInclude([item], include);
      }
      return item;
    },
    findMany: async ({ where, include, orderBy, take, select }: any = {}) => {
      if (overrides.findMany) {
        return overrides.findMany({ where, include, orderBy, take, select });
      }
      let fields = '*';
      if (select) {
        fields = Object.keys(select).map(k => `\`${k}\``).join(', ');
      }
      let query = `SELECT ${fields} FROM \`${tableName}\``;
      const values: any[] = [];
      if (where && typeof where === 'object') {
        const conditions: string[] = [];
        for (const [k, v] of Object.entries(where)) {
          if (v === undefined) continue;
          if (typeof v === 'object' && v !== null && (v as any).not !== undefined) {
            conditions.push(`\`${k}\` != ?`);
            values.push(formatVal((v as any).not));
          } else if (typeof v === 'object' && v !== null && (v as any).in !== undefined) {
            const arr = (v as any).in;
            if (arr.length > 0) {
              conditions.push(`\`${k}\` IN (${arr.map(() => '?').join(', ')})`);
              values.push(...arr.map(formatVal));
            } else {
              conditions.push('1 = 0');
            }
          } else if (typeof v === 'object' && v !== null && (v as any).gte !== undefined && (v as any).lte !== undefined) {
            conditions.push(`\`${k}\` >= ? AND \`${k}\` <= ?`);
            values.push(formatVal((v as any).gte), formatVal((v as any).lte));
          } else if (typeof v === 'object' && v !== null && (v as any).gte !== undefined) {
            conditions.push(`\`${k}\` >= ?`);
            values.push(formatVal((v as any).gte));
          } else if (typeof v === 'object' && v !== null && (v as any).lte !== undefined) {
            conditions.push(`\`${k}\` <= ?`);
            values.push(formatVal((v as any).lte));
          } else {
            conditions.push(`\`${k}\` = ?`);
            values.push(formatVal(v));
          }
        }
        if (conditions.length > 0) {
          query += ' WHERE ' + conditions.join(' AND ');
        }
      }
      if (orderBy && typeof orderBy === 'object') {
        if (Array.isArray(orderBy)) {
          const orderClauses = orderBy.map((o: any) => {
            const key = Object.keys(o)[0];
            return `\`${key}\` ${o[key].toUpperCase()}`;
          });
          query += ' ORDER BY ' + orderClauses.join(', ');
        } else {
          const keys = Object.keys(orderBy);
          if (keys.length > 0) {
            const key = keys[0];
            query += ` ORDER BY \`${key}\` ${(orderBy as any)[key].toUpperCase()}`;
          }
        }
      }
      if (take) {
        query += ` LIMIT ${Number(take)}`;
      }
      const [rows] = await pool.query<any[]>(query, values);
      if (include && overrides._handleInclude) {
        await overrides._handleInclude(rows, include);
      }
      return rows;
    },
    count: async ({ where }: any = {}) => {
      if (overrides.count) {
        return overrides.count({ where });
      }
      let query = `SELECT COUNT(*) as cnt FROM \`${tableName}\``;
      const values: any[] = [];
      if (where && typeof where === 'object') {
        const conditions: string[] = [];
        for (const [k, v] of Object.entries(where)) {
          if (v === undefined) continue;
          if (typeof v === 'object' && v !== null && (v as any).not !== undefined) {
            conditions.push(`\`${k}\` != ?`);
            values.push(formatVal((v as any).not));
          } else if (typeof v === 'object' && v !== null && (v as any).in !== undefined) {
            const arr = (v as any).in;
            if (arr.length > 0) {
              conditions.push(`\`${k}\` IN (${arr.map(() => '?').join(', ')})`);
              values.push(...arr.map(formatVal));
            } else {
              conditions.push('1 = 0');
            }
          } else {
            conditions.push(`\`${k}\` = ?`);
            values.push(formatVal(v));
          }
        }
        if (conditions.length > 0) {
          query += ' WHERE ' + conditions.join(' AND ');
        }
      }
      const [rows] = await pool.query<any[]>(query, values);
      return rows[0]?.cnt || 0;
    },
    create: async ({ data }: { data: any }) => {
      if (overrides.create) {
        return overrides.create({ data });
      }
      const cleanData = { ...data };
      if (!cleanData.id) cleanData.id = genId();
      if (!cleanData.createdAt && tableName !== 'Attendance' && tableName !== 'Session' && tableName !== 'Document') cleanData.createdAt = new Date();
      if (!cleanData.updatedAt && ['User', 'Employee', 'Department', 'Budget', 'Expense', 'Invoice', 'MarketingCampaign', 'Project', 'Task', 'Setting', 'PayrollRun', 'ServiceTicket', 'CalendarEvent', 'Asset', 'LeaveRequest', 'Account', 'Lead', 'Opportunity', 'SalesActivity', 'AppState'].includes(tableName)) cleanData.updatedAt = new Date();

      const nestedCreates: Record<string, any> = {};
      for (const [k, v] of Object.entries(cleanData)) {
        if (v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date) && (v as any).create) {
          nestedCreates[k] = (v as any).create;
          delete cleanData[k];
        } else if (v && typeof v === 'object' && !(v instanceof Date)) {
          cleanData[k] = JSON.stringify(v);
        }
      }

      const keys = Object.keys(cleanData).filter(k => cleanData[k] !== undefined);
      const fields = keys.map(k => `\`${k}\``).join(', ');
      const placeholders = keys.map(() => '?').join(', ');
      const values = keys.map(k => formatVal(cleanData[k]));

      await pool.query(`INSERT INTO \`${tableName}\` (${fields}) VALUES (${placeholders})`, values);

      for (const [relKey, relItems] of Object.entries(nestedCreates)) {
        const itemsArr = Array.isArray(relItems) ? relItems : [relItems];
        const childTable = relKey === 'spends' ? 'MarketingSpend' : relKey === 'contacts' ? 'Contact' : relKey;
        const fkName = tableName === 'MarketingCampaign' ? 'campaignId' : tableName === 'Lead' ? 'leadId' : `${tableName.toLowerCase()}Id`;
        for (const item of itemsArr) {
          const childData = { ...item, [fkName]: cleanData.id };
          if (!childData.id) childData.id = genId();
          if (!childData.createdAt) childData.createdAt = new Date();
          const cKeys = Object.keys(childData).filter(k => childData[k] !== undefined);
          const cFields = cKeys.map(k => `\`${k}\``).join(', ');
          const cPlaceholders = cKeys.map(() => '?').join(', ');
          const cValues = cKeys.map(k => formatVal(childData[k]));
          try {
            await pool.query(`INSERT INTO \`${childTable}\` (${cFields}) VALUES (${cPlaceholders})`, cValues);
          } catch {}
        }
      }

      const [rows] = await pool.query<any[]>(`SELECT * FROM \`${tableName}\` WHERE id = ? LIMIT 1`, [cleanData.id]);
      return rows[0] || cleanData;
    },
    createMany: async ({ data }: { data: any[] }) => {
      let count = 0;
      for (const item of data) {
        const cleanData = { ...item };
        if (!cleanData.id) cleanData.id = genId();
        if (!cleanData.createdAt && tableName !== 'Attendance' && tableName !== 'Session' && tableName !== 'Document') cleanData.createdAt = new Date();
        if (!cleanData.updatedAt && ['User', 'Employee', 'Department', 'Budget', 'Expense', 'Invoice', 'MarketingCampaign', 'Project', 'Task', 'Setting', 'PayrollRun', 'ServiceTicket', 'CalendarEvent', 'Asset', 'LeaveRequest', 'Account', 'Lead', 'Opportunity', 'SalesActivity', 'AppState'].includes(tableName)) cleanData.updatedAt = new Date();
        for (const [k, v] of Object.entries(cleanData)) {
          if (v && typeof v === 'object' && !(v instanceof Date)) {
            cleanData[k] = JSON.stringify(v);
          }
        }
        const keys = Object.keys(cleanData).filter(k => cleanData[k] !== undefined);
        const fields = keys.map(k => `\`${k}\``).join(', ');
        const placeholders = keys.map(() => '?').join(', ');
        const values = keys.map(k => formatVal(cleanData[k]));
        try {
          await pool.query(`INSERT INTO \`${tableName}\` (${fields}) VALUES (${placeholders})`, values);
          count++;
        } catch {}
      }
      return { count };
    },
    update: async ({ where, data }: any) => {
      if (overrides.update) {
        return overrides.update({ where, data });
      }
      const keys = Object.keys(where);
      if (keys.length === 0) return null;
      const whereFields = keys.map(k => `\`${k}\` = ?`).join(' AND ');
      const whereVals = keys.map(k => formatVal(where[k]));

      const cleanData = { ...data };
      if (!cleanData.updatedAt && ['User', 'Employee', 'Department', 'Budget', 'Expense', 'Invoice', 'MarketingCampaign', 'Project', 'Task', 'Setting', 'PayrollRun', 'ServiceTicket', 'CalendarEvent', 'Asset', 'LeaveRequest', 'Account', 'Lead', 'Opportunity', 'SalesActivity', 'AppState'].includes(tableName)) cleanData.updatedAt = new Date();
      for (const [k, v] of Object.entries(cleanData)) {
        if (v && typeof v === 'object' && !(v instanceof Date)) {
          cleanData[k] = JSON.stringify(v);
        }
      }
      const updateKeys = Object.keys(cleanData).filter(k => cleanData[k] !== undefined);
      if (updateKeys.length > 0) {
        const setFields = updateKeys.map(k => `\`${k}\` = ?`).join(', ');
        const setVals = updateKeys.map(k => formatVal(cleanData[k]));
        await pool.query(`UPDATE \`${tableName}\` SET ${setFields} WHERE ${whereFields}`, [...setVals, ...whereVals]);
      }
      const [rows] = await pool.query<any[]>(`SELECT * FROM \`${tableName}\` WHERE ${whereFields} LIMIT 1`, whereVals);
      return rows[0] || null;
    },
    delete: async ({ where }: any) => {
      const keys = Object.keys(where);
      if (keys.length === 0) return { success: false };
      const whereFields = keys.map(k => `\`${k}\` = ?`).join(' AND ');
      const whereVals = keys.map(k => formatVal(where[k]));
      await pool.query(`DELETE FROM \`${tableName}\` WHERE ${whereFields}`, whereVals);
      return { success: true };
    },
    deleteMany: async ({ where }: any = {}) => {
      if (overrides.deleteMany) {
        return overrides.deleteMany({ where });
      }
      if (!where || Object.keys(where).length === 0) {
        await pool.query(`DELETE FROM \`${tableName}\``);
        return { count: 1 };
      }
      const keys = Object.keys(where);
      const whereFields = keys.map(k => `\`${k}\` = ?`).join(' AND ');
      const whereVals = keys.map(k => formatVal(where[k]));
      await pool.query(`DELETE FROM \`${tableName}\` WHERE ${whereFields}`, whereVals);
      return { count: 1 };
    },
    upsert: async ({ where, update, create }: any) => {
      if (overrides.upsert) {
        return overrides.upsert({ where, update, create });
      }
      const keys = Object.keys(where);
      let rows: any[] = [];
      if (where.employeeId_date) {
        const { employeeId, date } = where.employeeId_date;
        const formattedDate = formatVal(date).slice(0, 10);
        const [r] = await pool.query<any[]>('SELECT * FROM Attendance WHERE employeeId = ? AND date = ? LIMIT 1', [employeeId, formattedDate]);
        rows = r;
      } else {
        const whereFields = keys.map(k => `\`${k}\` = ?`).join(' AND ');
        const whereVals = keys.map(k => formatVal(where[k]));
        const [r] = await pool.query<any[]>(`SELECT * FROM \`${tableName}\` WHERE ${whereFields} LIMIT 1`, whereVals);
        rows = r;
      }
      if (rows.length > 0) {
        return base.update({ where: { id: rows[0].id }, data: update });
      } else {
        return base.create({ data: create });
      }
    },
    aggregate: async ({ _sum, where }: any = {}) => {
      if (overrides.aggregate) {
        return overrides.aggregate({ _sum, where });
      }
      if (_sum && _sum.amount) {
        let query = `SELECT SUM(amount) as total FROM \`${tableName}\``;
        const values: any[] = [];
        if (where && typeof where === 'object') {
          const conditions: string[] = [];
          for (const [k, v] of Object.entries(where)) {
            if (v === undefined) continue;
            if (typeof v === 'object' && v !== null && (v as any).in !== undefined) {
              const arr = (v as any).in;
              conditions.push(`\`${k}\` IN (${arr.map(() => '?').join(', ')})`);
              values.push(...arr.map(formatVal));
            } else {
              conditions.push(`\`${k}\` = ?`);
              values.push(formatVal(v));
            }
          }
          if (conditions.length > 0) {
            query += ' WHERE ' + conditions.join(' AND ');
          }
        }
        const [rows] = await pool.query<any[]>(query, values);
        return { _sum: { amount: rows[0]?.total ? Number(rows[0].total) : 0 } };
      }
      return { _sum: {} };
    },
  };

  return { ...base, ...overrides };
}

// Direct MySQL2 Adapter replacing PrismaClient
class MySqlDb {
  pool = pool;

  async $disconnect() {
    await this.pool.end();
  }

  user = createDelegate('User');

  session = createDelegate('Session', {
    findUnique: async ({ where, include }: any) => {
      const [rows] = await pool.query<any[]>('SELECT * FROM Session WHERE token = ? LIMIT 1', [where.token]);
      const session = rows[0];
      if (!session) return null;
      if (include && include.user) {
        const [uRows] = await pool.query<any[]>('SELECT * FROM User WHERE id = ? LIMIT 1', [session.userId]);
        session.user = uRows[0] || null;
      }
      return session;
    },
    deleteMany: async ({ where }: any) => {
      if (where.token) {
        await pool.query('DELETE FROM Session WHERE token = ?', [where.token]);
      } else if (where.userId && where.NOT && where.NOT.token) {
        await pool.query('DELETE FROM Session WHERE userId = ? AND token != ?', [where.userId, where.NOT.token]);
      } else if (where.userId) {
        await pool.query('DELETE FROM Session WHERE userId = ?', [where.userId]);
      }
      return { count: 1 };
    },
  });

  employee = createDelegate('Employee', {
    _handleInclude: async (rows: any[], include: any) => {
      if (include && include.department) {
        for (const emp of rows) {
          if (emp.departmentId) {
            const [dRows] = await pool.query<any[]>('SELECT * FROM Department WHERE id = ? LIMIT 1', [emp.departmentId]);
            emp.department = dRows[0] || null;
          } else {
            emp.department = null;
          }
        }
      }
    },
  });

  department = createDelegate('Department', {
    _handleInclude: async (rows: any[], include: any) => {
      if (include && include._count && include._count.select && include._count.select.employees) {
        for (const d of rows) {
          const [cRows] = await pool.query<any[]>('SELECT COUNT(*) as cnt FROM Employee WHERE departmentId = ? AND status != "exited"', [d.id]);
          d._count = { employees: cRows[0]?.cnt || 0 };
        }
      }
    },
    upsert: async ({ where, update, create }: any) => {
      const [rows] = await pool.query<any[]>('SELECT * FROM Department WHERE name = ? LIMIT 1', [where.name]);
      const now = formatVal(new Date());
      if (rows.length > 0) {
        const id = rows[0].id;
        const fields: string[] = [];
        const values: any[] = [];
        for (const [k, v] of Object.entries(update)) {
          if (v !== undefined) {
            fields.push(`\`${k}\` = ?`);
            values.push(formatVal(v));
          }
        }
        if (fields.length > 0) {
          fields.push('updatedAt = ?');
          values.push(now, id);
          await pool.query(`UPDATE Department SET ${fields.join(', ')} WHERE id = ?`, values);
        }
        const [updated] = await pool.query<any[]>('SELECT * FROM Department WHERE id = ? LIMIT 1', [id]);
        return updated[0];
      } else {
        const id = genId();
        await pool.query(
          'INSERT INTO Department (id, name, head, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?)',
          [id, create.name, create.head || null, now, now]
        );
        const [created] = await pool.query<any[]>('SELECT * FROM Department WHERE id = ? LIMIT 1', [id]);
        return created[0];
      }
    },
  });

  attendance = createDelegate('Attendance', {
    upsert: async ({ where, update, create }: any) => {
      const { employeeId, date } = where.employeeId_date;
      const formattedDate = formatVal(date).slice(0, 10);
      const [rows] = await pool.query<any[]>('SELECT * FROM Attendance WHERE employeeId = ? AND date = ? LIMIT 1', [employeeId, formattedDate]);
      const now = formatVal(new Date());
      if (rows.length > 0) {
        const id = rows[0].id;
        const fields: string[] = [];
        const values: any[] = [];
        for (const [k, v] of Object.entries(update)) {
          if (v !== undefined) {
            fields.push(`\`${k}\` = ?`);
            values.push(formatVal(v));
          }
        }
        if (fields.length > 0) {
          values.push(id);
          await pool.query(`UPDATE Attendance SET ${fields.join(', ')} WHERE id = ?`, values);
        }
        const [updated] = await pool.query<any[]>('SELECT * FROM Attendance WHERE id = ? LIMIT 1', [id]);
        return updated[0];
      } else {
        const id = genId();
        await pool.query(
          'INSERT INTO Attendance (id, employeeId, date, status, checkIn, checkOut, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [id, create.employeeId, formattedDate, create.status || 'present', create.checkIn || null, create.checkOut || null, now]
        );
        const [created] = await pool.query<any[]>('SELECT * FROM Attendance WHERE id = ? LIMIT 1', [id]);
        return created[0];
      }
    },
  });

  leaveRequest = createDelegate('LeaveRequest', {
    _handleInclude: async (rows: any[], include: any) => {
      if (include && include.employee) {
        for (const l of rows) {
          const [eRows] = await pool.query<any[]>('SELECT id, name, designation FROM Employee WHERE id = ? LIMIT 1', [l.employeeId]);
          l.employee = eRows[0] || null;
        }
      }
    },
  });

  role = createDelegate('Role');

  vendor = createDelegate('Vendor');
  inventoryItem = createDelegate('InventoryItem');

  purchaseRequest = createDelegate('PurchaseRequest', {
    _handleInclude: async (rows: any[], include: any) => {
      if (include && include.vendor) {
        for (const pr of rows) {
          if (!pr.vendorId) { pr.vendor = null; continue; }
          const [vRows] = await pool.query<any[]>('SELECT * FROM Vendor WHERE id = ? LIMIT 1', [pr.vendorId]);
          pr.vendor = vRows[0] || null;
        }
      }
    },
  });

  account = createDelegate('Account', {
    _handleInclude: async (rows: any[], include: any) => {
      if (include && include.opportunities) {
        for (const a of rows) {
          const [oRows] = await pool.query<any[]>('SELECT * FROM Opportunity WHERE accountId = ? ORDER BY createdAt DESC', [a.id]);
          a.opportunities = oRows;
        }
      }
    },
  });

  opportunity = createDelegate('Opportunity', {
    _handleInclude: async (rows: any[], include: any) => {
      if (include && include.account) {
        for (const o of rows) {
          if (!o.accountId) { o.account = null; continue; }
          const [aRows] = await pool.query<any[]>('SELECT id, name FROM Account WHERE id = ? LIMIT 1', [o.accountId]);
          o.account = aRows[0] || null;
        }
      }
    },
  });

  budget = createDelegate('Budget');
  expense = createDelegate('Expense');
  invoice = createDelegate('Invoice');

  marketingCampaign = createDelegate('MarketingCampaign', {
    _handleInclude: async (rows: any[], include: any) => {
      if (include && include.spends) {
        for (const c of rows) {
          const [sRows] = await pool.query<any[]>('SELECT * FROM MarketingSpend WHERE campaignId = ? ORDER BY date ASC', [c.id]);
          c.spends = sRows;
        }
      }
    },
  });

  marketingSpend = createDelegate('MarketingSpend');
  project = createDelegate('Project');
  task = createDelegate('Task');
  approval = createDelegate('Approval');
  serviceTicket = createDelegate('ServiceTicket');
  calendarEvent = createDelegate('CalendarEvent');
  auditLog = createDelegate('AuditLog');
  document = createDelegate('Document');
  setting = createDelegate('Setting');
  appState = createDelegate('AppState');
  payrollRun = createDelegate('PayrollRun');
  payslip = createDelegate('Payslip');
  lead = createDelegate('Lead');
  contact = createDelegate('Contact');
  chatGroup = createDelegate('ChatGroup', {
    _handleInclude: async (rows: any[], include: any) => {
      if (include && include.members) {
        for (const g of rows) {
          const [mRows] = await pool.query<any[]>('SELECT * FROM ChatMember WHERE groupId = ?', [g.id]);
          g.members = mRows;
        }
      }
      if (include && include.messages) {
        for (const g of rows) {
          const [msgRows] = await pool.query<any[]>('SELECT * FROM ChatMessage WHERE groupId = ? ORDER BY timestamp DESC LIMIT 50', [g.id]);
          g.messages = msgRows;
        }
      }
    }
  });
  chatMember = createDelegate('ChatMember');
  chatMessage = createDelegate('ChatMessage');
}

export const prisma = new MySqlDb();
export const db = prisma;
