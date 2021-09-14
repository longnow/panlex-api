const array = require('../../lib/array');
const knex = require('../../lib/db');
const lateral = require('../../lib/lateral');
const finalizeColMap = require('../../lib/col_map');

const errors = require('restify-errors');

const DENOTATION_COLS = ['id','expr','meaning','source'];

const DENOTATION_COLS_MAP = finalizeColMap({}, DENOTATION_COLS, 'denotation');

const ARRAY_PARAMS = ['expr','id','langvar','meaning','source','uid'];

function init(app) {
  app.apiParam('denotation', loadDenotation);

  app.apiRoute({ path: '/v2/denotation', arrayParams: ARRAY_PARAMS, executeQuery: true }, denotation);
  app.apiRoute({ path: '/v2/denotation/count', arrayParams: ARRAY_PARAMS }, require('./count')('denotation', 'denotationx'));
  app.apiRoute({ path: '/v2/denotation/:denotation' });
}

function query(req) {
  const q = knex('denotationx as denotation');
  req.selectCols(q, DENOTATION_COLS_MAP, DENOTATION_COLS);

  const knownQuery = req.get('knownQuery');
  const include = req.get('include');

  if (include.denotation_class) {
    knownQuery.include.denotation_class = true;

    const subq = knex
      .select(knex.raw('array_agg(json_build_array(denotation_class.expr1, denotation_class.expr2) ORDER BY denotation_class.id) as val'))
      .from('denotation_class')
      .where('denotation_class.denotation', knex.raw('denotation.id'));

    lateral.leftJoin(q, subq, 'denotation_class');
    q.select(knex.raw("coalesce(denotation_class.val, '{}') as denotation_class"));
  }

  if (include.denotation_prop) {
    knownQuery.include.denotation_prop = true;

    const subq = knex
      .select(knex.raw('array_agg(json_build_array(denotation_prop.expr, denotation_prop.txt) ORDER BY denotation_prop.id) as val'))
      .from('denotation_prop')
      .where('denotation_prop.denotation', knex.raw('denotation.id'));

    lateral.leftJoin(q, subq, 'denotation_prop');
    q.select(knex.raw("coalesce(denotation_prop.val, '{}') as denotation_prop"));
  }

  return q;
}

function conditions(req, q, counting) {
  const knownQuery = req.get('knownQuery');
  let numParams = 0;

  if ('id' in req.query) {
    knownQuery.id = true;
    q.where('denotation.id', array.id(req.query.id, 'id'));
    numParams++;
  }

  if ('meaning' in req.query) {
    knownQuery.meaning = true;
    q.where('denotation.meaning', array.id(req.query.meaning, 'meaning'));
    numParams++;
  }

  if ('expr' in req.query) {
    knownQuery.expr = true;
    q.where('denotation.expr', array.id(req.query.expr, 'expr'));
    numParams++;
  }

  if ('source' in req.query) {
    knownQuery.source = true;
    q.where('denotation.source', array.id(req.query.source, 'source'));
    numParams++;
  }

  if ('langvar' in req.query) {
    knownQuery.langvar = true;
    q.where('denotation.langvar', array.id(req.query.langvar, 'langvar'));
    numParams++;
  }

  if ('uid' in req.query) {
    knownQuery.uid = true;
    q.where('denotation.langvar', ...array.uidLangvar(req.query.uid, 'uid'));
    numParams++;
  }

  if ('denotation_class' in req.query) {
    knownQuery.denotation_class = true;

    q.whereExists(function () {
      this
        .select(knex.raw(1))
        .from('denotation_class')
        .where('denotation_class.denotation', knex.raw('denotation.id'))
        .where(array.class_(req.query.denotation_class, 'denotation_class.expr1', 'denotation_class.expr2', 'denotation_class'))
    });
}

  if ('denotation_prop' in req.query) {
    knownQuery.denotation_prop = true;

    q.whereExists(function () {
      this
        .select(knex.raw(1))
        .from('denotation_prop')
        .where('denotation_prop.denotation', knex.raw('denotation.id'))
        .where(array.prop(req.query.denotation_prop, 'denotation_prop.expr', 'denotation_prop.txt', 'denotation_prop'));
    });
  }

  return numParams;
}

function loadDenotation(req, res, next, denotation) {
  if (denotation.match(/^\d+$/)) {
    query(req).where('denotation.id', denotation)
    .first().then(row => {
      if (!row) next(new errors.ResourceNotFoundError(`denotation ${denotation} was not found`));
      else {
        req.get('obj').denotation = row;
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

  req.applyGlobalParams(q, DENOTATION_COLS_MAP, 'id', 'denotation', 'you must specify at least one of the "denotation", "expr", "langvar", "meaning", "source", or "uid" parameters');

  const obj = req.get('obj');
  obj.resultType = 'denotation';
  next();
}

module.exports = {
  init: init,
  conditions: conditions,
  query: query
};
