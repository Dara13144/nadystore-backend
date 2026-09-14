import { Request, Response, NextFunction } from 'express';
export declare const ADMIN_EMAILS: string[];
export interface AuthenticatedRequest extends Request {
    user?: {
        id: string;
        role: string;
        email: string;
    };
}
/**
 * Universal token extractor: checks Bearer header, raw header, custom headers, cookies, and query
 */
export declare function extractToken(req: Request): string | null;
export declare function authenticateJWT(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<Response<any, Record<string, any>> | undefined>;
export declare function requireAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction): Response<any, Record<string, any>> | undefined;
