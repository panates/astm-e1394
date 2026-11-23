import type { AstmMessage } from '../astm-message.js';
import type { AstmConnection } from './astm-connection.js';

/**
 * What a message is, read from its records, since ASTM has no message type:
 * 'query' holds a Q record, 'result' R records, 'order' O records with no R,
 * and 'other' is anything else.
 */
export type AstmMessageKind = 'query' | 'result' | 'order' | 'other';

/** Gives the kind of a message (see AstmMessageKind) */
export function messageKind(message: AstmMessage): AstmMessageKind {
  const types = new Set(message.records.map(r => r.recordType));
  if (types.has('Q')) return 'query';
  if (types.has('R')) return 'result';
  if (types.has('O')) return 'order';
  return 'other';
}

/** The link a request came over, as handlers see it */
export interface AstmRequestLink {
  readonly connection: AstmConnection;
  send(message: AstmMessage | string): Promise<void>;
}

/** A message received, as handlers see it */
export interface AstmRequest {
  readonly link: AstmRequestLink;
  readonly message: AstmMessage;
  readonly kind: AstmMessageKind;
}

/** What a handler answers with: a message set here is sent back to the instrument */
export interface AstmResponse {
  message?: AstmMessage | string;
}

export type NextFunction = (error?: unknown) => void;

/**
 * A handler with two arguments runs, and the next one runs after it. One
 * with three runs the next only when it calls next(); if its promise settles
 * without a call to next(), the handlers after it do not run.
 */
export type AstmHandler =
  | ((req: AstmRequest, res: AstmResponse) => unknown)
  | ((req: AstmRequest, res: AstmResponse, next: NextFunction) => unknown);

/**
 * Which messages a handler takes: a kind, several kinds, 'any', or a
 * function of the request.
 */
export type AstmMessageFilter =
  AstmMessageKind | 'any' | AstmMessageKind[] | ((req: AstmRequest) => boolean);

type Test = (req: AstmRequest) => boolean;

interface Entry {
  handler: AstmHandler | AstmRouter;
  test?: Test;
}

interface Step {
  handler: AstmHandler;
  tests: Test[];
}

/**
 * Handlers for the messages a link receives. A router is made once and
 * given to several links, or to a TCP server, with their use(router).
 */
export class AstmRouter {
  protected _stack = new Map<number, Entry[]>();

  /**
   * Adds a handler, or another router, for every message - or, given a
   * filter first, for the messages it matches: `use('result', store)`,
   * `use('query', answer)`. Handlers run in ascending priority order
   * (default 0), then in the order they were added.
   */
  use(handler: AstmHandler | AstmRouter, priority?: number): this;
  use(
    filter: AstmMessageFilter,
    handler: AstmHandler | AstmRouter,
    priority?: number,
  ): this;
  use(...args: any[]): this {
    let test: Test | undefined;
    if (
      typeof args[0] === 'string' ||
      Array.isArray(args[0]) ||
      (typeof args[0] === 'function' &&
        args[1] !== undefined &&
        typeof args[1] !== 'number')
    ) {
      test = compileFilter(args.shift());
    }
    const [handler, priority = 0] = args as [AstmHandler | AstmRouter, number?];
    if (typeof handler !== 'function' && !(handler instanceof AstmRouter)) {
      throw new TypeError('A handler must be a function or an AstmRouter');
    }
    let list = this._stack.get(priority);
    if (!list) {
      list = [];
      this._stack.set(priority, list);
    }
    list.push({ handler, test });
    return this;
  }

  /** True when no handler was added */
  get isEmpty(): boolean {
    return !this._steps().length;
  }

  /**
   * Runs the handlers that match the request, in order. Resolves true when
   * at least one ran, and rejects with the error a handler threw or passed
   * to next().
   */
  async handle(req: AstmRequest, res: AstmResponse): Promise<boolean> {
    let ran = false;
    for (const step of this._steps()) {
      if (!step.tests.every(t => t(req))) continue;
      ran = true;
      const { handler } = step;
      if (handler.length < 3) {
        await (handler as any)(req, res);
        continue;
      }
      const goOn = await new Promise<boolean>((resolve, reject) => {
        let settled = false;
        const next: NextFunction = error => {
          if (settled) return;
          settled = true;
          if (error) reject(error);
          else resolve(true);
        };
        Promise.resolve()
          .then(() => (handler as any)(req, res, next))
          .then(
            () => {
              /* Settled without next(): the handlers after it do not run */
              if (settled) return;
              settled = true;
              resolve(false);
            },
            e => next(e ?? new Error('A handler failed')),
          );
      });
      if (!goOn) break;
    }
    return ran;
  }

  /**
   * The handlers in the order they run, routers added to this one laid out
   * in place. Worked out at each call, so a router changed after it was
   * added is seen.
   */
  protected _steps(tests: Test[] = []): Step[] {
    const steps: Step[] = [];
    const priorities = [...this._stack.keys()].sort((a, b) => a - b);
    for (const p of priorities) {
      for (const entry of this._stack.get(p)!) {
        const t = entry.test ? [...tests, entry.test] : tests;
        if (entry.handler instanceof AstmRouter) {
          steps.push(...entry.handler._steps(t));
        } else steps.push({ handler: entry.handler, tests: t });
      }
    }
    return steps;
  }
}

function compileFilter(filter: AstmMessageFilter): Test {
  if (typeof filter === 'function') return filter;
  if (filter === 'any') return () => true;
  const kinds = new Set<string>(Array.isArray(filter) ? filter : [filter]);
  for (const kind of kinds) {
    if (!['query', 'result', 'order', 'other'].includes(kind)) {
      throw new TypeError(`Unknown message kind "${kind}"`);
    }
  }
  return req => kinds.has(req.kind);
}
