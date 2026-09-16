import { Request, Response, NextFunction } from 'express';
export declare const ADMIN_EMAILS: string[];
export interface AuthenticatedRequest extends Request {
    user?: {
        id: string;
        role: string;
        email: string;
    };
    resource?: any;
}
/**
 * Universal token extractor: checks Bearer header, raw header, custom headers, cookies, and query
 */
export declare function extractToken(req: Request): string | null;
export declare function authenticateJWT(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<Response<any, Record<string, any>> | undefined>;
export declare function requireAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction): Response<any, Record<string, any>> | undefined;
/**
 * Middleware factory that verifies the authenticated user owns the requested resource
 * (or is an admin). Fetches the resource from DB and attaches it to req.resource.
 *
 * Usage: app.get('/api/orders/:id', authenticateJWT, requireOwnership('order'), handler)
 *
 * The resource model MUST have a `userId` field linking it to a user.
 *
 * @param resourceType - Prisma model name (e.g., 'order', 'user')
 * @param idParam      - Route param name for the resource ID (default: 'id')
 */
export declare function requireOwnership(resourceType: string, idParam?: string): (req: AuthenticatedRequest, res: Response, next: NextFunction) => Promise<Response<any, Record<string, any>> | undefined>;
