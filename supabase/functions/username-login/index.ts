import { handleRequest } from './handler.ts';

Deno.serve((req: Request) => handleRequest(req));
