const array = require('../../lib/array');
const knex = require('../../lib/db');
const lateral = require('../../lib/lateral');
const finalizeColMap = require('../../lib/col_map');

const errors = require('restify-errors');
const _ = require('lodash');

const MEANING_COLS = ['dn','ex','mn','ap'];

const MEANING_COLS_MAP = finalizeColMap({
  dn: { sqlExpr: "coalesce(d.dn, '{}')", sort: false },
  ex: { sqlExpr: "coalesce(d.ex, '{}')", sort: false },
  checksum: 'meaning_checksum.checksum',
  record: 'meaning_checksum.record',
}, MEANING_COLS, 'mn');

const ARRAY_PARAMS = ['mn','ex','ap'];

function init(app) {
  app.apiParam('mn', loadMeaning);

  app.apiRoute({ path: '/mn', arrayParams: ARRAY_PARAMS, executeQuery: true }, meaning);
  app.apiRoute({ path: '/mn/count', arrayParams: ARRAY_PARAMS }, require('./count')('mn'));
  app.apiRoute({ path: '/mn/:mn' });
}

function query(req) {
  const q = knex('mn');
  req.selectCols(q, MEANING_COLS_MAP, MEANING_COLS);

  const subq = knex
    .select(knex.raw('array_agg(dn.dn ORDER BY dn.dn) as dn'), knex.raw('array_agg(dn.ex ORDER BY dn.ex) as ex'))
    .from('dn')
    .where('dn.mn', knex.raw('mn.mn'));

  lateral.leftJoin(q, subq, 'd');

  const knownQuery = req.get('knownQuery');
  const include = req.get('include');

  if (include.mcs) {
    knownQuery.include.mcs = true;

    const subq = knex
      .select(knex.raw('array_agg(json_build_array(mcs.ex0, mcs.ex1) ORDER BY mcs.mcs) as val'))
      .from('mcs')
      .where('mcs.mn', knex.raw('mn.mn'));

    lateral.leftJoin(q, subq, 'mcs');
    q.select(knex.raw("coalesce(mcs.val, '{}') as mcs"));
  }

  if (include.mpp) {
    knownQuery.include.mpp = true;

    const subq = knex
      .select(knex.raw('array_agg(json_build_array(mpp.ex, mpp.tt) ORDER BY mpp.mpp) as val'))
      .from('mpp')
      .where('mpp.mn', knex.raw('mn.mn'));

    lateral.leftJoin(q, subq, 'mpp');
    q.select(knex.raw("coalesce(mpp.val, '{}') as mpp"));
  }

  if (include.df) {
    knownQuery.include.df = true;

    const subq = knex
      .select(knex.raw("array_agg(json_build_object('mn',df.df,'lv',df.lv,'tt',df.tt,'td',df.td) ORDER BY df.df) as val"))
      .from('df')
      .where('df.mn', knex.raw('mn.mn'));

    lateral.leftJoin(q, subq, 'df');
    q.select(knex.raw("coalesce(df.val, '{}') as df"));
  }

  if (include.checksum) {
    knownQuery.include.checksum = true;

    req.ensureJoin(q, 'meaning_checksum', 'meaning_checksum.mn', 'mn.mn');
    req.selectCol(q, MEANING_COLS_MAP, 'checksum');
  }

  if (include.record) {
    knownQuery.include.record = true;

    req.ensureJoin(q, 'meaning_checksum', 'meaning_checksum.mn', 'mn.mn');
    req.selectCol(q, MEANING_COLS_MAP, 'record');
  }

  return q;
}

function conditions(req, q, counting) {
  const knownQuery = req.get('knownQuery');
  let numParams = 0;

  if ('mn' in req.query) {
    knownQuery.mn = true;
    q.where('mn.mn', array.id(req.query.mn, 'mn'));
    numParams++;
  }

  if ('ap' in req.query) {
    knownQuery.ap = true;
    q.where('mn.ap', array.id(req.query.ap, 'ap'));
    numParams++;
  }

  if ('ex' in req.query) {
    knownQuery.ex = true;

    const expr = _.uniq(req.query.ex);
    q.whereExists(function () {
      this
        .select(knex.raw(1))
        .from('dn as dn2')
        .where('dn2.mn', knex.raw('mn.mn'))
        .where('dn2.ex', array.id(expr, 'ex'))
        .having(knex.raw('count(*)'), '>=', expr.length);
    });
    numParams++;
  }

  if ('mcs' in req.query) {
    knownQuery.mcs = true;

    q.whereExists(function () {
      this
        .select(knex.raw(1))
        .from('mcs')
        .where('mcs.mn', knex.raw('mn.mn'))
        .where(array.class_(req.query.mcs, 'mcs.ex0', 'mcs.ex1', 'mcs'))
    });
  }

  if ('mpp' in req.query) {
    knownQuery.mpp = true;

    q.whereExists(function () {
      this
        .select(knex.raw(1))
        .from('mpp')
        .where('mpp.mn', knex.raw('mn.mn'))
        .where(array.prop(req.query.mpp, 'mpp.ex', 'mpp.tt', 'mpp'));
    });
  }

  return numParams;
}

function loadMeaning(req, res, next, meaning) {
  if (meaning.match(/^\d+$/)) {
    query(req).where('mn.mn', meaning)
    .first().then(row => {
      if (!row) next(new errors.ResourceNotFoundError(`meaning ${meaning} was not found`));
      else {
        req.get('obj').mn = row;
        next();
      }
    }).catch(err => {
      next(new errors.InternalError(err.message || err));
    });
  }
  else next(new errors.InvalidArgumentError('the meaning must be specified as a numeric id'));
}

function meaning(req, res, next) {
  const q = query(req);
  req.set('numParams', conditions(req, q));

  req.applyGlobalParams(q, MEANING_COLS_MAP, 'mn', 'meaning', 'you must specify at least one search parameter');

  const obj = req.get('obj');
  obj.resultType = 'mn';
  next();
}

module.exports = {
  init: init,
  conditions: conditions,
  query: query
};
