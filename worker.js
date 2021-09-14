const restify = require('restify');
const errors = require('restify-errors');
const corsMiddleware = require('restify-cors-middleware2');
const Request = require('http').IncomingMessage;
const spawnSync = require('child_process').spawnSync;

const cache = require('./lib/cache');
const formatters = require('./lib/formatters');
const knex = require('./lib/db');
const logger = require('./lib/logger');
const makeRestError = require('./lib/make_rest_error');
const redis = require('./lib/redis');
const throttle = require('./lib/throttle');
const validate = require('./lib/validate');

const config = require('./config');
const dev = process.env.NODE_ENV === 'development';

const app = restify.createServer({
  name: 'PanLex API',
  formatters: {
    'application/json; q=0.9': formatters.json,
  },
  //handleUncaughtExceptions: true,
  version: require('./package.json').version
});

// generates post/get routes with looser url params and try/catch wrapper
app.apiRoute = apiRoute(app);

// used in lieu of app.param() in order to control order in routing chain
app.apiParam = apiParam(app);

// override request headers
app.pre(overrideHeaders);
// add 'Connection: close' for curl
app.pre(restify.plugins.pre.userAgentConnection());
// add req.get/req.set methods
app.pre(restify.plugins.pre.context());

// disable gzip, because nginx does it for us in the current setup
//app.use(restify.plugins.gzipResponse());

// throttle request rate, if enabled in config
if (config.throttle) {
  config.throttle.unlimited = config.throttle.unlimited || [];
  config.throttle.unlimited.push('127.0.0.1');

  const result = spawnSync('dig', ['+short', 'myip.opendns.com', '@resolver1.opendns.com'], { encoding: 'utf8' });
  if (result.error) console.log('could not determine public IP, local requests to it will be throttled');
  else config.throttle.unlimited.push(result.stdout.trim());

  app.use(throttleUnlessWhitelisted());
}

const cors = corsMiddleware({
  origins:      ['*'],
  allowHeaders: ['x-app-name'],
});
app.pre(cors.preflight);
app.use(cors.actual);

// return error if request asks for unsupported format
app.use(restify.plugins.acceptParser('application/json'));

// parse query string put it into req.query (not req.params)
app.use(restify.plugins.queryParser({ depth: 1, arrayLimit: config.limit.arrayMax }));

// parse body as JSON and put it in req.body (not req.params)
app.use(restify.plugins.jsonBodyParser());

// initialize routes
require('./routes')(app);

// log to a file if we were provided a path
if (logger.log) {
  app.on('after', function logRequest(req, res, route, err) {
    if (err || res.statusCode !== 200) logger.errorLog.warn({ err: err, req: req, res: res });
    //else log.info({ req: req, res: res });
  });
}

// app.on('uncaughtException', function(req, res, route, err) {
//   err = makeRestError(err);

//   if (logger.log) logger.errorLog.error({ err: err, req: req, res: res });

//   res.json(err);
// });

if (redis) redis.once('ready', startApp);
else startApp();

function startApp() {
  app.server.setTimeout((config.requestTimeout || 120) * 1000);

  app.listen(process.env.PORT || config.port || 3000, config.address || '127.0.0.1', () => {
    console.log("%s - %s listening at %s (pid %s)", new Date().toISOString(), app.name, app.url, process.pid);
  });
}

function overrideHeaders(req, res, next) {
  req.headers['content-type'] = 'application/json';
  next();
}

function throttleUnlessWhitelisted() {
  if (config.throttle.unlimited) {
    return (req, res, next) => {
      const xff = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
      if (!xff || config.throttle.unlimited.some(ip => ip === xff)) next();
      else throttle(req, res, next);
    }
  }
  else {
    return throttle;
  }
}

function mergeBodyIntoQuery(req, res, next) {
  if (req.body) {
    if (req.body instanceof Object && !(req.body instanceof Array)) {
      for (const k in req.body) {
        req.query[k] = req.body[k];
      }
    }
    else {
      return next(new errors.InvalidContentError('the HTTP body must be a JSON object'));
    }
  }
  next();
}

function cachedResponse(req, res, next) {
  // don't look for a cached response if the cache param is false,
  // or if sort is random (which can't be cached)
  if ('cache' in req.query && !req.query.cache ||
      'sort' in req.query && req.query.sort[0] === 'random')
    return next();

  // store the entire query except for the 'cache' parameter, with default limit and offset
  const cachedQuery = { limit: config.limit.responseMax, offset: 0 };
  req.set('cachedQuery', cachedQuery);
  for (const i in req.query) {
    if (i !== 'cache') cachedQuery[i] = req.query[i];
  }

  // if a cached response is available, send it
  cache.get(req, (err, obj) => {
    if (err) {
      console.error('redis error in cachedResponse');
      console.error(err);
      next();
    }
    else if (obj) {
      res.setHeader('X-Cache', 'hit');
      res.json(obj);
      next(false); // explicitly abort handler chain
    }
    else next();
  });
}

function init1(req, res, next) {
  const obj = {};
  req.set('obj', obj);

  if (req.query.echo) {
    const query = {};
    for (const i in req.query) {
      query[i] = req.query[i];
    }

    obj.request = {
      url: req.url,
      query: query
    };
  }

  next();
}

function init2(req, res, next) {
  req.set('state', {});
  req.set('join', {});
  req.set('groupBy', {});
  req.set('sortable', {});
  req.set('knownQuery', { cache: true, echo: true, exclude: {}, include: {}, indent: true });

  ['exclude','include'].forEach(clude => {
    const obj = {};
    req.set(clude, obj);

    if (clude in req.query) {
      req.query[clude].forEach(item => {
        validate.string(item, clude, true);
        obj[item] = true;
      })
    }
  });

  if ('indent' in req.query) req.query.indent = validate.bool(req.query.indent, 'indent');
  req.set('jsonIndent', dev || req.query.indent ? 4 : null);

  next();
}

// applies the "sort", "limit", "offset", and "after" params to q
Request.prototype.applyGlobalParams = function (q, mapCols, id, table, offsetAfterErr, unlimited) {
  const knownQuery = this.get('knownQuery');
  const sortable = this.get('sortable');

  let limit = this.query.limit;

  if ('limit' in this.query) {
    knownQuery.limit = true;
    if (unlimited) validate.nonNegativeInteger(limit, 'limit');
    else validate.positiveInteger(limit, 'limit');
    limit = Math.min(limit, config.limit.responseMax);
  }
  else limit = config.limit.responseMax;

  if (limit) q.limit(limit);

  let sort = this.query.sort;
  const idCol = mapCols[id].sqlExpr;
  let random = false;

  // sort by primary key if no order specified, for consistent paging
  if (!('sort' in this.query)) {
    q.orderBy(idCol);
    sort = [[idCol, 'asc']];
  }
  else {
    knownQuery.sort = true;

    if (sort.length === 1 && sort[0] === 'random') {
      random = true;

      if (!q._statements.some(i => i.grouping === 'where')) {
        // when getting random rows from all of a large table, instead of ordering by random(),
        // which is slow, choose random ids based on estimated max id.
        // to account for the possibility of missing ids, generate 50 times as many random ids as we need.

        q.where(idCol, knex.raw("ANY(ARRAY(SELECT (random()*(SELECT reltuples FROM pg_class JOIN pg_namespace on (pg_class.relnamespace = pg_namespace.oid) WHERE relname = ? AND (nspname = 'public' OR nspname = 'deriv')))::integer FROM generate_series(1, ?)))", [table, limit*50]));

        q.orderBy(idCol);
      }
      else q.orderByRaw('random()');
    }
    else {
      sort = sort.map(item => {
        const spec = item.toLowerCase().split(/\s+/);
        const col = spec[0];

        if (spec.length > 2) throw new errors.InvalidArgumentError('invalid sort specification: ' + JSON.stringify(item));

        if (col in mapCols && mapCols[col].sort) {
          if (!sortable[col]) throw new errors.InvalidArgumentError(`the field "${col}" is not a valid field to sort by: you may need to pass it under "include"`);

          const sqlExpr = mapCols[col].sqlExpr;
          let direction;

          if (spec[1]) {
            if (spec[1] === 'asc' || spec[1] === 'desc') direction = spec[1];
            else throw new errors.InvalidArgumentError('sort direction must be specified as "asc" or "desc": ' + JSON.stringify(item));
          }
          else direction = 'asc';

          q.orderBy(knex.raw(sqlExpr), direction); // knex.raw needed for functions, like uid()
          return [sqlExpr, direction];
        }
        else throw new errors.InvalidArgumentError(`the field "${col}" is not a valid field to sort by`);
      });
    }
  }

  const checkOffsetAfter = param => {
    if (random)
      throw new errors.InvalidArgumentError(`the parameter "${param}" cannot be used when sorting by "random"`);

    if (offsetAfterErr && this.get('numParams') === 0)
      throw new errors.MissingParameterError(`${offsetAfterErr} when passing "${param}"`);
  };

  if ('offset' in this.query) {
    knownQuery.offset = true;
    checkOffsetAfter('offset');

    const offset = this.query.offset;
    validate.nonNegativeInteger(offset, 'offset');

    if (offset > config.limit.offsetMax)
      throw new errors.InvalidArgumentError(`the parameter "offset" cannot be greater than ${config.limit.offsetMax}`);

    q.offset(offset);
  }

  if ('after' in this.query) {
    knownQuery.after = true;
    checkOffsetAfter('after');

    if (this.query.after.length !== sort.length)
      throw new errors.InvalidArgumentError('the parameter "after" must contain the same number of elements as "sort"');

    if (sort.length === 1) {
      const after = this.query.after[0];
      validate.scalar(after, 'after', true);

      const spec = sort[0];
      q.where(knex.raw(spec[0]), (spec[1] === 'asc' ? '>' : '<'), after);
    }
    else {
      const left = [];
      const right = [];

      this.query.after.forEach((item, i) => {
        validate.scalar(item, 'after', true);

        const spec = sort[i];

        if (spec[1] === 'asc') {
          left.push(spec[0]);
          right.push('?');
        }
        else {
          if (typeof item !== 'number' && !(typeof item === 'string' && item.match(/^-?\d+$/)))
            throw new errors.InvalidArgumentError('the parameter "after" cannot be used with a non-integer field in descending direction, when sorting by multiple fields');

          left.push('-' + spec[0]);
          right.push('-?::integer');
        }
      });

      q.where(knex.raw('(' + left.join(',') + ') > (' + right.join(',') + ')', this.query.after));
    }
  }

  if ('sql' in this.query) {
    knownQuery.sql = true;
    validate.bool(this.query.sql, 'sql');
  }

  this.set('q', q);
  //console.log(q.toString());
};

Request.prototype.groupBy = function (q, ...items) {
  const groupBy = this.get('groupBy');
  const newGroupBy = [];

  items.forEach(item => {
    if (!groupBy[item]) {
      newGroupBy.push(item);
      groupBy[item] = true;
    }
  });

  if (newGroupBy.length) q.groupBy(newGroupBy);
}

Request.prototype.ensureJoin = function (q, name, ...cond) {
  const join = this.get('join');
  if (!join[name]) {
    q.join(name, ...cond);
    join[name] = true;
  }
}

Request.prototype.ensureLeftJoin = function (q, name, ...cond) {
  const join = this.get('join');
  if (!join[name]) {
    q.leftJoin(name, ...cond);
    join[name] = true;
  }
}

// selects columns, respecting the "exclude" parameter
Request.prototype.selectCols = function (q, mapCols, cols) {
  const knownQuery = this.get('knownQuery');
  const exclude = this.get('exclude');
  const sortable = this.get('sortable');

  const selectCols = [];

  cols.forEach(col => {
    if (mapCols[col].sort) {
      sortable[col] = true;
    }

    if (exclude[col]) {
      knownQuery.exclude[col] = true;
    }
    else {
      selectCols.push(knex.raw(mapCols[col].sqlExprAliased));
    }
  });

  if (selectCols.length) {
    q.select(selectCols);
  }
};

// selects a single column
Request.prototype.selectCol = function (q, mapCols, col, alias) {
  const knownQuery = this.get('knownQuery');
  const sortable = this.get('sortable');

  if (mapCols[col]) {
    if (mapCols[col].sort) {
      sortable[col] = true;
    }

    col = mapCols[col].sqlExprAliased;
  }
  else if (alias) {
    col = `${col} as ${alias}`;
  }

  q.select(knex.raw(col));
};

function paramError(req, res, next) {
  const knownQuery = req.get('knownQuery');
  const errParam = [];
  const errClude = { exclude: [], include: [] };

  for (const k in req.query) {
    if (k === 'exclude' || k === 'include') continue;
    if (!knownQuery[k]) errParam.push(k);
  }

  ['exclude','include'].forEach(clude => {
    for (const k in req.get(clude)) {
      if (!knownQuery[clude][k]) errClude[clude].push(k);
    }
  });

  if (errParam.length || errClude.exclude.length || errClude.include.length) {
    const strs = [];

    if (errParam.length) {
      errParam.sort();
      strs.push('the following parameters are unknown or incompatible with your query: ' + errParam.join(', '));
    }

    ['exclude','include'].forEach(clude => {
      if (errClude[clude].length) {
        errClude[clude].sort();
        strs.push(`the following ${clude} items are unknown or incompatible with your query: ` + errClude[clude].join(', '));
      }
    });

    next(new errors.InvalidArgumentError(strs.join('; ')));
  }
  else next();
}

function executeQuery(req, res, next) {
  const q = req.get('q');
  const obj = req.get('obj');

  if (req.query.sql) {
    obj.sql = q.toString();
    next();
  }
  else {
    q.then(rows => {
      const transform = req.get('transform');
      if (transform) rows.forEach(transform);

      obj.result = rows;
      obj.resultNum = rows.length;
      obj.resultMax = config.limit.responseMax;

      next();
    }).catch(err => {
      next(makeRestError(err));
    });
  }
}

function sendObj(req, res, next) {
  res.json(req.get('obj'));
}

function apiParam(app) {
  app._paramFn = {};

  return (name, fn) => {
    app._paramFn[name] = wrapErrorHandler(function _param(req, res, next) {
      if (req.params && name in req.params) {
        fn.call(this, req, res, next, req.params[name], name);
      }
      else next();
    });
  }
}

function apiRoute(app) {
  return (...args) => {
    let opts = args.shift();
    if (typeof opts === 'string') opts = { path: opts };
    opts.urlParamPattern = opts.urlParamPattern || '[^/]+';

    // array to hold initializing routes
    const preChain = [init1]; // start initializing custom req state

    // make appropriate req.query items into arrays
    preChain.push(makeArray((opts.arrayParams || []).concat(['after','exclude','include','sort'])));

    // check for cached response and use it, if enabled in config
    if (config.cache && !(opts.cache === false)) preChain.push(cachedResponse);

    // finish initializing custom req state and initialize res headers
    preChain.push(wrapErrorHandler(init2));

    // URL param handlers
    const paramRe = /\/:([a-z]+)/g;
    let match;
    while ((match = paramRe.exec(opts.path)) !== null) {
      if (app._paramFn[match[1]]) {
        preChain.push(app._paramFn[match[1]]);
      }
    }

    const postChain = [paramError];

    if (opts.executeQuery) {
      postChain.push(executeQuery);
    }

    postChain.push(sendObj);

    args = args.map(fn => wrapErrorHandler(fn));

    app.post(opts, mergeBodyIntoQuery, preChain, args, postChain);
    app.get(opts, preChain, args, postChain);
  }
}

function makeArray(params) {
  return (req, res, next) => {
    params.forEach(param => {
      if (param in req.query && !(req.query[param] instanceof Array)) {
        req.query[param] = [req.query[param]];
      }
    });
    next();
  }
}

function wrapErrorHandler(handler) {
  return (req, res, next) => {
    try {
      return handler.call(this, req, res, next);
    }
    catch (err) {
      if (err instanceof errors.HttpError) next(err);
      else {
        console.log(err);
        next(new errors.InternalError('unexpected error, please notify info@panlex.org'));
      }
    }
  }
}
