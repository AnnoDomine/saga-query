import { call, takeEvery } from 'redux-saga/effects';
import sagaCreator from 'redux-saga-creator';

import {
  Action,
  ActionWithPayload,
  CreateActionPayload,
  CreateAction,
  CreateActionWithPayload,
} from './types';

export type Middleware<Ctx = any> = (ctx: Ctx, next: Next) => any;
export type Next = () => any;

export function compose<Ctx = any>(middleware: Middleware<Ctx>[]) {
  if (!Array.isArray(middleware)) {
    throw new TypeError('Middleware stack must be an array!');
  }
  for (const fn of middleware) {
    if (typeof fn !== 'function') {
      throw new TypeError('Middleware must be composed of functions!');
    }
  }

  return function* composeSaga(context: Ctx, next?: Next) {
    // last called middleware #
    let index = -1;
    yield call(dispatch, 0);

    function* dispatch(i: number): any {
      if (i <= index) {
        throw new Error('next() called multiple times');
      }
      index = i;
      let fn: any = middleware[i];
      if (i === middleware.length) fn = next;
      if (!fn) return;
      yield call(fn, context, dispatch.bind(null, i + 1));
    }
  };
}

const isFn = (fn?: any) => fn && typeof fn === 'function';
const isObject = (obj?: any) => typeof obj === 'object' && obj !== null;

export interface SagaApi<Ctx = any> {
  saga: () => (...options: any[]) => Generator<any, any, any>;
  use: (fn: Middleware<Ctx>) => void;
  create(name: string): CreateAction;
  create<P>(name: string): CreateActionWithPayload<P>;
  create(name: string, req: { saga?: any }): CreateAction;
  create<P>(name: string, req: { saga?: any }): CreateActionWithPayload<P>;
  create(name: string, fn: Middleware<Ctx> | Middleware<Ctx>[]): CreateAction;
  create<P>(
    name: string,
    fn: Middleware<Ctx> | Middleware<Ctx>[],
  ): CreateActionWithPayload<P>;
  create(
    name: string,
    req: { saga?: any },
    fn: Middleware<Ctx> | Middleware<Ctx>[],
  ): CreateAction;
  create<P>(
    name: string,
    req: { saga?: any },
    fn: Middleware<Ctx> | Middleware<Ctx>[],
  ): CreateActionWithPayload<P>;
}

export const defaultOnError = (err: Error) => {
  throw err;
};

export const API_ACTION_PREFIX = '@@saga-query/api';
export function createApi<Ctx = any>({
  onError = defaultOnError,
}: {
  onError?: (err: Error) => any;
} = {}): SagaApi<Ctx> {
  const middleware: Middleware<Ctx>[] = [];
  const sagas: { [key: string]: any } = {};
  const createType = (post: string) => `${API_ACTION_PREFIX}/${post}`;
  function* onApi(
    curMiddleware: Middleware<Ctx>[],
    action: ActionWithPayload<any>,
  ): Generator<any, Ctx, any> {
    const ctx: any = {
      payload: action.payload,
    };
    const fn = compose(curMiddleware as any);
    yield call(fn, ctx);
    return ctx;
  }

  function create(createName: string, ...args: any[]) {
    const type = createType(createName);
    const action = (payload?: any) => {
      return { type, payload };
    };
    action.toString = () => `${type}`;
    let req = null;
    let fn = null;
    if (args.length === 2) {
      req = args[0];
      fn = args[1];
    }

    if (args.length === 1) {
      if (isFn(args[0]) || Array.isArray(args[0])) {
        fn = args[0];
      } else {
        req = args[0];
      }
    }

    if (req && !isObject(req)) {
      throw new Error('Options must be an object');
    }

    if (fn && Array.isArray(fn)) {
      fn = compose(fn);
    }

    if (fn && !isFn(fn)) {
      throw new Error('Middleware must be a function');
    }

    const tt = req ? (req as any).saga : takeEvery;
    const curMiddleware = fn ? [fn, ...middleware] : [...middleware];

    function* curSaga() {
      yield tt(`${action}`, onApi, curMiddleware);
    }
    sagas[`${action}`] = curSaga;
    const actionFn = (options?: any) => action({ name: createName, options });
    actionFn.toString = () => createName;
    actionFn.run = (options?: any) =>
      call(onApi, curMiddleware, actionFn(options));
    return actionFn;
  }

  return {
    saga: () => sagaCreator(sagas, onError),
    use: (fn: Middleware<Ctx>) => {
      middleware.push(fn);
    },
    create,
  };
}
