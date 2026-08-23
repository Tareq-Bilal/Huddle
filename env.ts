import { env as loadenv } from 'custom-env';
import z from 'zod';

process.env.APP_STAGE = process.env.APP_STAGE || 'development';

const isDevStage = process.env.APP_STAGE === 'development';
const isProdStage = process.env.APP_STAGE === 'production';
const isTestStage = process.env.APP_STAGE === 'test';

if (isDevStage) {
    loadenv('development');
} else if (isTestStage) {
    loadenv('test');
} else if (isProdStage) {
    loadenv('production');
}

const envSchema = z.object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    APP_STAGE: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.string().default('3000'),
    DATABASE_URL: z.string().url().startsWith('postgresql://'),
    JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters long'),
    JWT_EXPIRES_IN: z.string().default('1h'),
    BCRYPT_SALT_ROUNDS: z.coerce.number().min(10).max(20).default(12),
});

type ENV = z.infer<typeof envSchema>;

let env: ENV;

try {
    env = envSchema.parse(process.env);
} catch (error) {
    if (error instanceof z.ZodError) {
        console.error('Invalid environment variables:', JSON.stringify(error.flatten(), null, 2));
        error.issues.forEach((err) => {
            const path = err.path.join('.');
            console.error(`- ${path}: ${err.message}`);
        });
    }
    process.exit(1);
}

export const isProduction = () => env.NODE_ENV === 'production';
export const isDevelopment = () => env.NODE_ENV === 'development';
export const isTest = () => env.NODE_ENV === 'test';

export default env;
