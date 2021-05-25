# saga-query

Data fetching and caching using redux-saga.  Use our saga middleware system to
quickly build data loading within your redux application. 

## Features

- Write middleware to handle fetching, synchronizing, and caching API requests
- Unleash the power of redux-saga to handle any async flow control use-cases
- Pre-built middleware to cut out boilerplate for interacting with redux and
  redux-saga

## Why?

Libraries like `react-query`, `rtk-query`, and `apollo-client` are making it
easier than every to fetch data and cache data from an API server.  All of them
have their unique attributes and I encourage everyone to check them out if they
haven't.

I find that the async flow control of `redux-saga` is one of the most robust
and powerful declaractive side-effect system I have come across.  Treating
side-effects as data makes testing dead simple and provides a powerful effect
handling system to accomodate any use-case.  Features like polling, data
loading states, cancellation, racing, parallelization, optimistic updates,
offline support, undo/redo are at your disposal when using `redux-saga`.  Other
libraries and paradigms can also accomplish the same tasks, but I think nothing
rivals the readability and maintainability of redux/redux-saga.

All three libraries above are reinventing async flow control and hiding them
from the end-developer.  For the happy path, this works beautifully.  Why learn
how to make optimistic ui work when a library can do it for you?  Why learn how
to efficiently cache API data when a library can do it for you?  If you never
need to think about how data is cached and queried in the front-end, then those
libraries will probably be sufficient for your needs.

However, if you need to control how data is cached in the front-end, or you
need more granular control over the flow of your business logic, then
`saga-query` might suit your needs.

## We are not

- A DSL wrapped around data loading logic
- Magical
- Going to accommodate all use-cases

## Show me

```tsx
import { put, call } from 'redux-saga/effects';
import { createTable, createLoaderTable, createReducerMap } from 'robodux';
import { createApi, fetchBody, urlParser, FetchCtx } from
'saga-query';

interface User {
  id: string;
  email: string;
}

const users = createTable<User>({ name: 'users' });
const api = createApi<FetchCtx>();
api.use(fetchBody);
api.use(urlParser);

api.use(function* onFetch(ctx, next) {
  const { url, ...options } = ctx.request;
  const resp = yield call(fetch, url, options);
  const data = yield call([resp, 'json']);

  ctx.response = { status: resp.status, ok: true, data };
  yield next();
});

const fetchUsers = api.create(
  `/users`,
  function* processUsers(ctx: FetchCtx<{ users: User[] }>, next) {
    yield next();
    if (!ctx.response.ok) return;

    const { data } = ctx.response;
    const curUsers = data.users.reduce<MapEntity<User>>((acc, u) => {
      acc[u.id] = u;
      return acc;
    }, {});
    yield put(users.actions.add(curUsers));
  },
);

const reducers = createReducerMap(users);
const store = setupStore(reducers, api.saga());

store.dispatch(fetchUsers());
```

## Break it down for me

```tsx
import { put, call } from 'redux-saga/effects';
import { createTable, createLoaderTable, createReducerMap } from 'robodux';
import { createApi, fetchBody, urlParser, FetchCtx } from
'saga-query';

// create a reducer that acts like a SQL database table
// the keys are the id and the value is the record
const users = createTable<User>({ name: 'users' });

// something awesome happens in here
const api = createApi<FetchCtx>();

// fetchBody sets up the ctx object with `ctx.request` and `ctx.response` used
// specifically for the recommended ctx `FetchCtx`.
api.use(fetchBody);

// urlParser is a middleware that will take the name of `api.create(name)` and
// replace it with the values passed into the action
api.use(urlParser);

// this is where you defined your core fetching logic
api.use(function* onFetch(ctx, next) {
  // ctx.request is the object used to make a fetch request when using
  // `fetchBody` and `urlParser`
  const { url, ...options } = ctx.request;
  const resp = yield call(fetch, url, options);
  const data = yield call([resp, 'json']);

  // with `FetchCtx` we want to set the `ctx.response` so other middleware can
  // use it.
  ctx.response = { status: resp.status, ok: true, data };

  // we almost *always* need to call `yield next()` that way other middleware will be
  // called downstream of this middleware. The only time we don't call `next`
  // is when we don't want to call any middleware after this one.
  yield next();
});

// This is how you create a function that will fetch an API endpoint.  The
// first parameter is the name of the action type.  When using `urlParser` it
// will also be the URL inside `ctx.request.url` of which you can do what you
// want with it.
const fetchUsers = api.create(
  `/users`,
  // This middleware is special: it gets prepended to the list of middleware.
  // This has the unique benefit of being in full control of when the other
  // middleware get activated.
  // The type inside of `FetchCtx` is the response object
  function* processUsers(ctx: FetchCtx<{ users: User[] }>, next) {
    // anything before this call can mutate the `ctx` object before it gets
    // sent to the other middleware
    yield next();
    // anything after the above line happens *after* the middleware gets called and
    // and a fetch has been made.

    // using FetchCtx 
    if (!ctx.response.ok) return;

    // data = { users: User[] };
    const { data } = ctx.response;
    const curUsers = data.users.reduce<MapEntity<User>>((acc, u) => {
      acc[u.id] = u;
      return acc;
    }, {});

    // save the data to our redux slice called `users`
    yield put(users.actions.add(curUsers));
  },
);

const fetchUser = query.create<{ id: string, email: string }>(
  // Here we see the power of `urlParser`. It will replace any slug `:x` with
  // the corresponding value found inside the payload that gets dispatched by
  // this action.
  `/users/:id`,
  function* processUser(ctx: FetchCtx<User>, next) {
    ctx.request = {
      method: 'POST',
      body: JSON.stringify({ email: ctx.params.email }),
    };
    yield next();
    if (!ctx.response.ok) return;

    const curUser = ctx.response.data;
    const curUsers = { [curUser.id]: curUser };

    yield put(cache.actions.add(curUsers));
  },
);

const reducers = createReducerMap(users);
// this is a fake function `setupStore`
// pretend that it sets up your redux store and runs the saga middleware
const store = setupStore(reducers, api.saga());

store.dispatch(fetchUsers());
store.dispatch(fetchUser({ id: '1', email: 'change.me@saga.com' }));
```

## Recipes

### Loading state

```tsx
// api.ts
import { put, call } from 'redux-saga/effects';
import { 
  createTable, 
  createLoaderTable, 
  createReducerMap, 
  defaultLoadingItem,
} from 'robodux';
import { 
  createApi, 
  fetchBody, 
  urlParser, 
  FetchCtx, 
  createLoadingTracker,
} from 'saga-query';

interface User {
  id: string;
  email: string;
}

export const loaders = createLoaderTable({ name: 'loaders' });
const selectLoaders = (s) => s[loaders.name];
export const selectLoaderById = (s, { id }) => selectLoaders(s)(id) ||
defaultLoadingItem();

export const users = createTable<User>({ name: 'users' });
export const { 
  selectTableAsList: selectUsersAsList 
} = users.getSelectors((s) => s[users.name]);

export const api = createApi<FetchCtx>();
api.use(fetchBody);
api.use(urlParser);
api.use(createLoadingTracker(loaders));

api.use(function* onFetch(ctx, next) {
  const { url, ...options } = ctx.request;
  const resp = yield call(fetch, url, options);
  const data = yield call([resp, 'json']);

  ctx.response = { status: resp.status, ok: true, data };
  yield next();
});

const fetchUsers = api.create(
  `/users`,
  function* processUsers(ctx: FetchCtx<{ users: User[] }>, next) {
    yield next();
    if (!ctx.response.ok) return;

    const { data } = ctx.response;
    const curUsers = data.users.reduce<MapEntity<User>>((acc, u) => {
      acc[u.id] = u;
      return acc;
    }, {});
    yield put(users.actions.add(curUsers));
  },
);

const reducers = createReducerMap(users, loaders);
const store = setupStore(reducers, api.saga());
```

```tsx
// app.tsx
import React from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { 
  loaders, 
  users, 
  fetchUsers, 
  selectUsersAsList, 
  selectLoaderById
} from './api';

const App = () => {
  const users = useSelector(selectUsersAsList);
  const loader = useSelector(
    (s) => selectLoaderById(s, { id: `${fetchUsers}` })
  );

  if (loader.loading) {
    return <div>Loading ...</div>
  }

  if (loader.error) {
    return <div>Error: {loader.error}</div>
  }

  return (
    <div>{users.map((user) => <div key={user.id}>{user.email}</div>)}</div>
  );
}
```

### Take Latest

If two requests are made:
- (A) request; then
- (B) request

While (A) request is still in flight, (B) request would be cancelled.

```tsx
import { takeLatest } from 'redux-saga/effects';

// this is for demonstration purposes, you can all import it using
// import { latest } from 'saga-query';
function* latest(action: string, saga: any, ...args: any[]) {
  yield takeLatest(`${action}`, saga, ...args);
}

const fetchUsers = api.create(
  `/users`,
  { saga: latest },
  function* processUsers(ctx, next) {
    yield next();
    // ...
  },
);
```

### Polling

```tsx
import { take, call, delay, race } from 'redux-saga/effects';

function* poll(action: string, saga: any, ...args: any[]) {
  function* fire(timer: number) {
    while (true) {
      yield call(saga, ...args);
      yield delay(timer);
    }
  }

  while (true) {
    const action = yield take(`${action}`);
    yield race([
      call(fire, action.payload.timer),
      take(`${action}`),
    ]);
  }
}

const pollUsers = api.create<{ timer: number }>(
  `/users`,
  { saga: poll },
  function* processUsers(ctx, next) {
    yield next();
    // ...
  }
);
```

```tsx
import React, { useState, useEffect } from 'react';
import { useDispatch } from 'react-redux';
import { pollUsers } from './api';

const App = () => {
  const dispatch = useDispatch();
  const [polling, setPolling] = useState(false);

  useEffect(() => {
    dispatch(pollUsers({ timer: 5 * 1000 }));
  }, [polling]);

  return (
    <div>
      <div>Polling: {polling ? 'on' : 'off'}</div>
      <button onClick={() => setPolling(!polling)}>Toggle Polling</button>
    </div>
  );
}
```

### Optimistic UI
import { put, select } from 'redux-saga/effects';

const updateUser = api.create<Partial<User> & { id: string }>(
  `/users/:id`, 
  function* onUpdateUser(ctx: FetchCtx<User>, next) {
    const user = ctx.options.email;
    ctx.request = {
      method: 'PATCH',
      body: JSON.stringify(user),
    };

    // save the current user record in a variable
    const prevUser = yield select(selectUserById(state, { id: user.id }));
    // optimistically update user
    yield put(users.actions.patch({ [user.id]: user }));

    // activate PATCH request
    yield next();

    // oops something went wrong, revert!
    if (!ctx.response.ok) {
      yield put(users.actions.add({ [prevUser.id]: prevUser });
      return;
    }

    // even though we know what was updated, it's still a good habit to 
    // update our local cache with what the server sent us
    const nextUser = ctx.response.data;
    yield put(users.actions.add({ [nextUser.id]: nextUser })); 
  },
)
