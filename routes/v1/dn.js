const array = require('../../lib/array');
const knex = require('../../lib/db');
const lateral = require('../../lib/lateral');
const finalizeColMap = require('../../lib/col_map');

const errors = require('restify-errors');

const DENOTATION_COLS = ['dn','ex','mn','ap'];

const DENOTATION_COLS_MAP = finalizeColMap({}, DENOTATION_COLS, 'dn');

const ARRAY_PARAMS = ['ex','dn','lv','mn','ap','uid'];

function init(app) {
  app.apiParam('dn', loadDenotation);

  app.apiRoute({ path: '/dn', arrayParams: ARRAY_PARAMS, executeQuery: true }, denotation);
  app.apiRoute({ path: '/dn/count', arrayParams: ARRAY_PARAMS }, require('./count')('dn', 'dnx'));
  app.apiRoute({ path: '/dn/:dn' });
}

function query(req) {
  const q = knex('dnx as dn');
  req.selectCols(q, DENOTATION_COLS_MAP, DENOTATION_COLS);

  const knownQuery = req.get('knownQuery');
  const include = req.get('include');

  if (include.dcs) {
    knownQuery.include.dcs = true;

    const subq = knex
      .select(knex.raw('array_agg(json_build_array(dcs.ex0, dcs.ex1) ORDER BY dcs.dcs) as val'))
      .from('dcs')
      .where('dcs.dn', knex.raw('dn.dn'));

    lateral.leftJoin(q, subq, 'dcs');
    q.select(knex.raw("coalesce(dcs.val, '{}') as dcs"));
  }

  if (include.dpp) {
    knownQuery.include.dpp = true;

    const subq = knex
      .select(knex.raw('array_agg(json_build_array(dpp.ex, dpp.tt) ORDER BY dpp.dpp) as val'))
      .from('dpp')
      .where('dpp.dn', knex.raw('dn.dn'));

    lateral.leftJoin(q, subq, 'dpp');
    q.select(knex.raw("coalesce(dpp.val, '{}') as dpp"));
  }

  return q;
}

function conditions(req, q, counting) {
  const knownQuery = req.get('knownQuery');
  let numParams = 0;

  if ('dn' in req.query) {
    knownQuery.dn = true;
    q.where('dn.dn', array.id(req.query.dn, 'dn'));
    numParams++;
  }

  if ('mn' in req.query) {
    knownQuery.mn = true;
    q.where('dn.mn', array.id(req.query.mn, 'mn'));
    numParams++;
  }

  if ('ex' in req.query) {
    knownQuery.ex = true;
    q.where('dn.ex', array.id(req.query.ex, 'ex'));
    numParams++;
  }

  if ('ap' in req.query) {
    knownQuery.ap = true;
    q.where('dn.ap', array.id(req.query.ap, 'ap'));
    numParams++;
  }

  if ('lv' in req.query) {
    knownQuery.lv = true;
    q.where('dn.lv', array.id(req.query.lv, 'lv'));
    numParams++;
  }

  if ('uid' in req.query) {
    knownQuery.uid = true;
    q.where('dn.lv', ...array.uidLangvar(req.query.uid, 'uid'));
    numParams++;
  }

  if ('dcs' in req.query) {
    knownQuery.dcs = true;

    q.whereExists(function () {
      this
        .select(knex.raw(1))
        .from('dcs')
        .where('dcs.dn', knex.raw('dn.dn'))
        .where(array.class_(req.query.dcs, 'dcs.ex0', 'dcs.ex1', 'dcs'))
    });
}

  if ('dpp' in req.query) {
    knownQuery.dpp = true;

    q.whereExists(function () {
      this
        .select(knex.raw(1))
        .from('dpp')
        .where('dpp.dn', knex.raw('dn.dn'))
        .where(array.prop(req.query.dpp, 'dpp.ex', 'dpp.tt', 'dpp'));
    });
  }

  return numParams;
}

function loadDenotation(req, res, next, denotation) {
  if (denotation.match(/^\d+$/)) {
    query(req).where('dn.dn', denotation)
    .first().then(row => {
      if (!row) next(new errors.ResourceNotFoundError(`denotation ${denotation} was not found`));
      else {
        req.get('obj').dn = row;
        next();
      }
    }).catch(err => {
      next(new errors.InternalError(err.message || err));
    });
  }
  else next(new errors.InvalidArgumentError('the denotation must be specified as a numeric id'));
}

function denotation(req, res, next) {
  const q = query(req);
  req.set('numParams', conditions(req, q));

  req.applyGlobalParams(q, DENOTATION_COLS_MAP, 'dn', 'denotation', 'you must specify at least one of the "dn", "ex", "lv", "mn", "ap", or "uid" parameters');

  const obj = req.get('obj');
  obj.resultType = 'dn';
  next();
}

module.exports = {
  init: init,
  conditions: conditions,
  query: query
};
