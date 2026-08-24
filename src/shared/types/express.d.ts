/** Lets `authenticate` attach the caller's identity to the request, so downstream
 *  handlers read `req.user` instead of re-parsing the Authorization header.
 *  Optional because it is only set on routes that ran `authenticate`. */
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: number;
        email: string;
      };
    }
  }
}

export {};
