const array = require('../../lib/array');
const knex = require('../../lib/db');
const finalizeColMap = require('../../lib/col_map');

const errors = require('restify-errors');

const DEFINITION_COLS = ['df','mn','lv','tt','td'];

const DEFINITION_COLS_MAP = finalizeColMap({
  ex:           'dn.ex',
  exlv:   'ex.lv',
  extt:       'ex.tt',
  extd:  'ex.td',
  exuid:       'uid(lv2.lc,lv2.vc)',
  uid:            'uid(lv.lc,lv.vc)',
}, DEFINITION_COLS, 'df');

const ARRAY_PARAMS = ['ex','exlv','extt','extd','exuid','df','lv','mn','tt','td','uid'];

function init(app) {
  app.apiParam('df', loadDefinition);

  app.apiRoute({ path: '/df', arrayParams: ARRAY_PARAMS, executeQuery: true }, params, definition);
  app.apiRoute({ path: '/df/count', arrayParams: ARRAY_PARAMS }, params, require('./count')('df'));
  app.apiRoute({ path: '/df/:df' });
}

function params(req, res, next) {
  if ('ex' in req.query || 'exlv' in req.query || 'exuid' in req.query ||
      'extt' in req.query || 'extd' in req.query)
  {
    req.get('state').ex = true;
  }

  next();
}

function query(req) {
  const q = knex('df');
  req.selectCols(q, DEFINITION_COLS_MAP, DEFINITION_COLS);

  const knownQuery = req.get('knownQuery');
  const include = req.get('include');

  if (include.uid) {
    knownQuery.include.uid = true;
    q.join('lv', 'lv.lv', 'df.lv');
    req.selectCol(q, DEFINITION_COLS_MAP, 'uid');
  }

  if (req.get('state').ex) {
    q
      .join('mn', 'mn.mn', 'df.mn')
      .join('dn', 'dn.mn', 'mn.mn');
    req.selectCols(q, DEFINITION_COLS_MAP, ['ex']);

    if (include.exlv) {
      knownQuery.include.exlv = true;
      req.ensureJoin(q, 'ex', 'ex.ex', 'dn.ex');
      req.selectCol(q, DEFINITION_COLS_MAP, 'exlv');
    }

    if (include.exuid) {
      knownQuery.include.exuid = true;
      req.ensureJoin(q, 'ex', 'ex.ex', 'dn.ex');
      q.join('lv as lv2', 'lv2.lv', 'ex.lv')
      req.selectCol(q, DEFINITION_COLS_MAP, 'exuid');
    }

    if (include.extt) {
      knownQuery.include.extt = true;
      req.ensureJoin(q, 'ex', 'ex.ex', 'dn.ex');
      req.selectCol(q, DEFINITION_COLS_MAP, 'extt');
    }

    if (include.extd) {
      knownQuery.include.extd = true;
      req.ensureJoin(q, 'ex', 'ex.ex', 'dn.ex')
      req.selectCol(q, DEFINITION_COLS_MAP, 'extd');
    }
  }

  return q;
}

function conditions(req, q, counting) {
  const knownQuery = req.get('knownQuery');
  let numParams = 0;

  if ('df' in req.query) {
    knownQuery.df = true;
    q.where('df.df', array.id(req.query.df, 'df'));
    numParams++;
  }

  if ('mn' in req.query) {
    knownQuery.mn = true;
    q.where('df.mn', array.id(req.query.mn, 'mn'));
    numParams++;
  }

  if ('lv' in req.query) {
    knownQuery.lv = true;
    q.where('df.lv', array.id(req.query.lv, 'lv'));
    numParams++;
  }

  if ('uid' in req.query) {
    knownQuery.uid = true;
    q.where('df.lv', ...array.uidLangvar(req.query.uid, 'uid'));
    numParams++;
  }

  if ('tt' in req.query) {
    knownQuery.tt = true;
    q.where('df.tt', array.txtNFC(req.query.tt, 'tt'));
    numParams++;
  }

  if ('td' in req.query) {
    knownQuery.td = true;
    q.where('df.td', ...array.txtDegr(req.query.td, 'td'));
    numParams++;
  }

  if (req.get('state').ex) {
    if (counting) {
      q
        .join('mn', 'mn.mn', 'df.mn')
        .join('dn', 'dn.mn', 'mn.mn');
    }

    if ('ex' in req.query) {
      knownQuery.ex = true;
      q.where('dn.ex', array.id(req.query.ex, 'ex'));
      numParams++;
    }

    if ('exlv' in req.query) {
      knownQuery.exlv = true;
      req.ensureJoin(q, 'ex', 'ex.ex', 'dn.ex')
      q.where('ex.lv', array.id(req.query.exlv, 'exlv'));
      numParams++;
    }

    if ('exuid' in req.query) {
      knownQuery.exuid = true;
      req.ensureJoin(q, 'ex', 'ex.ex', 'dn.ex');
      q.where('ex.lv', ...array.uidLangvar(req.query.exuid, 'exuid'));
      numParams++;
    }

    if ('extt' in req.query) {
      knownQuery.extt = true;
      req.ensureJoin(q, 'ex', 'ex.ex', 'dn.ex');
      q.where('ex.tt', array.txtNFC(req.query.extt, 'extt'));
      numParams++;
    }

    if ('extd' in req.query) {
      knownQuery.extd = true;
      req.ensureJoin(q, 'ex', 'ex.ex', 'dn.ex');
      q.where('ex.td', ...array.txtDegr(req.query.extd, 'extd'));
      numParams++;
    }

  }

  return numParams;
}

function loadDefinition(req, res, next, definition) {
  if (definition.match(/^\d+$/)) {
    query(req).where('df.df', definition)
    .first().then(row => {
      if (!row) next(new errors.ResourceNotFoundError(`definition ${definition} was not found`));
      else {
        req.get('obj').df = row;
        next();
      }
    }).catch(err => {
      next(new errors.InternalError(err.message || err));
    });
  }
  else next(new errors.InvalidArgumentError('the definition must be specified as a numeric id'));
}

function definition(req, res, next) {
  const q = query(req);
  req.set('numParams', conditions(req, q));

  req.applyGlobalParams(q, DEFINITION_COLS_MAP, 'df', 'definition', 'you must specify at least one search parameter');

  const obj = req.get('obj');
  obj.resultType = 'df';
  next();
}

module.exports = {
  init: init,
  conditions: conditions,
  query: query
};
