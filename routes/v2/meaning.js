const array = require('../../lib/array');
const knex = require('../../lib/db');
const lateral = require('../../lib/lateral');
const finalizeColMap = require('../../lib/col_map');

const errors = require('restify-errors');
const _ = require('lodash');

const MEANING_COLS = ['denotation','expr','id','source'];

const MEANING_COLS_MAP = finalizeColMap({
  denotation: { sqlExpr: "coalesce(d.denotation, '{}')", sort: false },
  expr: { sqlExpr: "coalesce(d.expr, '{}')", sort: false },
  checksum: 'meaning_checksum.checksum',
  record: 'meaning_checksum.record',
}, MEANING_COLS, 'meaning');

const ARRAY_PARAMS = ['id','expr','source'];

function init(app) {
  app.apiParam('meaning', loadMeaning);

  app.apiRoute({ path: '/v2/meaning', arrayParams: ARRAY_PARAMS, executeQuery: true }, meaning);
  app.apiRoute({ path: '/v2/meaning/count', arrayParams: ARRAY_PARAMS }, require('./count')('meaning'));
  app.apiRoute({ path: '/v2/meaning/:meaning' });
}

function query(req) {
  const q = knex('meaning');
  req.selectCols(q, MEANING_COLS_MAP, MEANING_COLS);

  const subq = knex
    .select(knex.raw('array_agg(denotation.id ORDER BY denotation.id) as denotation'), knex.raw('array_agg(denotation.expr ORDER BY denotation.expr) as expr'))
    .from('denotation')
    .where('denotation.meaning', knex.raw('meaning.id'));

  lateral.leftJoin(q, subq, 'd');

  const knownQuery = req.get('knownQuery');
  const include = req.get('include');

  if (include.meaning_class) {
    knownQuery.include.meaning_class = true;

    const subq = knex
      .select(knex.raw('array_agg(json_build_array(meaning_class.expr1, meaning_class.expr2) ORDER BY meaning_class.id) as val'))
      .from('meaning_class')
      .where('meaning_class.meaning', knex.raw('meaning.id'));

    lateral.leftJoin(q, subq, 'meaning_class');
    q.select(knex.raw("coalesce(meaning_class.val, '{}') as meaning_class"));
  }

  if (include.meaning_prop) {
    knownQuery.include.meaning_prop = true;

    const subq = knex
      .select(knex.raw('array_agg(json_build_array(meaning_prop.expr, meaning_prop.txt) ORDER BY meaning_prop.id) as val'))
      .from('meaning_prop')
      .where('meaning_prop.meaning', knex.raw('meaning.id'));

    lateral.leftJoin(q, subq, 'meaning_prop');
    q.select(knex.raw("coalesce(meaning_prop.val, '{}') as meaning_prop"));
  }

  if (include.definition) {
    knownQuery.include.definition = true;

    const subq = knex
      .select(knex.raw("array_agg(json_build_object('id',definition.id,'langvar',definition.langvar,'txt',definition.txt,'txt_degr',definition.txt_degr) ORDER BY definition.id) as val"))
      .from('definition')
      .where('definition.meaning', knex.raw('meaning.id'));

    lateral.leftJoin(q, subq, 'definition');
    q.select(knex.raw("coalesce(definition.val, '{}') as definition"));
  }

  if (include.checksum) {
    knownQuery.include.checksum = true;

    req.ensureJoin(q, 'meaning_checksum', 'meaning_checksum.meaning', 'meaning.id');
    req.selectCol(q, MEANING_COLS_MAP, 'checksum');
  }

  if (include.record) {
    knownQuery.include.record = true;

    req.ensureJoin(q, 'meaning_checksum', 'meaning_checksum.meaning', 'meaning.id');
    req.selectCol(q, MEANING_COLS_MAP, 'record');
  }

  return q;
}

function conditions(req, q, counting) {
  const knownQuery = req.get('knownQuery');
  let numParams = 0;

  if ('id' in req.query) {
    knownQuery.id = true;
    q.where('meaning.id', array.id(req.query.id, 'id'));
    numParams++;
  }

  if ('source' in req.query) {
    knownQuery.source = true;
    q.where('meaning.source', array.id(req.query.source, 'source'));
    numParams++;
  }

  if ('expr' in req.query) {
    knownQuery.expr = true;

    const expr = _.uniq(req.query.expr);
    q.whereExists(function () {
      this
        .select(knex.raw(1))
        .from('denotation as denotation2')
        .where('denotation2.meaning', knex.raw('meaning.id'))
        .where('denotation2.expr', array.id(expr, 'expr'))
        .having(knex.raw('count(*)'), '>=', expr.length);
    });
    numParams++;
  }

  if ('meaning_class' in req.query) {
    knownQuery.meaning_class = true;

    q.whereExists(function () {
      this
        .select(knex.raw(1))
        .from('meaning_class')
        .where('meaning_class.meaning', knex.raw('meaning.id'))
        .where(array.class_(req.query.meaning_class, 'meaning_class.expr1', 'meaning_class.expr2', 'meaning_class'))
    });
  }

  if ('meaning_prop' in req.query) {
    knownQuery.meaning_prop = true;

    q.whereExists(function () {
      this
        .select(knex.raw(1))
        .from('meaning_prop')
        .where('meaning_prop.meaning', knex.raw('meaning.id'))
        .where(array.prop(req.query.meaning_prop, 'meaning_prop.expr', 'meaning_prop.txt', 'meaning_prop'));
    });
  }

  return numParams;
}

function loadMeaning(req, res, next, meaning) {
  if (meaning.match(/^\d+$/)) {
    query(req).where('meaning.id', meaning)
    .first().then(row => {
      if (!row) next(new errors.ResourceNotFoundError(`meaning ${meaning} was not found`));
      else {
        req.get('obj').meaning = row;
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

  req.applyGlobalParams(q, MEANING_COLS_MAP, 'id', 'meaning', 'you must specify at least one search parameter');

  const obj = req.get('obj');
  obj.resultType = 'meaning';
  next();
}

module.exports = {
  init: init,
  conditions: conditions,
  query: query
};
