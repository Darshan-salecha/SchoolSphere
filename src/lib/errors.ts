export class AppError extends Error {
  constructor(
    message: string,
    readonly status: number = 400,
    readonly code: string = 'BAD_REQUEST',
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const badRequest = (m = 'Invalid request', d?: unknown) => new AppError(m, 400, 'BAD_REQUEST', d);
export const unauthorized = (m = 'Please sign in to continue') => new AppError(m, 401, 'UNAUTHORIZED');
export const forbidden = (m = 'You do not have permission to do that') => new AppError(m, 403, 'FORBIDDEN');
export const notFound = (m = 'Not found') => new AppError(m, 404, 'NOT_FOUND');
export const conflict = (m = 'That record already exists') => new AppError(m, 409, 'CONFLICT');
export const tooMany = (m = 'Too many attempts. Please try again later.') => new AppError(m, 429, 'RATE_LIMITED');
