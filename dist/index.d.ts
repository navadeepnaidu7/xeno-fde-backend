import { Express } from 'express';
declare global {
    namespace Express {
        interface Request {
            rawBody?: string;
        }
    }
}
declare const app: Express;
export default app;
//# sourceMappingURL=index.d.ts.map