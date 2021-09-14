const array = require('../../lib/array');
const knex = require('../../lib/db');
const finalizeColMap = require('../../lib/col_map');

const errors = require('restify-errors');

const DEFINITION_COLS = ['id','meaning','langvar','txt','txt_degr'];

const DEFINITION_COLS_MAP = finalizeColMap({
  expr:           'denotation.expr',
  expr_langvar:   'expr.langvar',
  expr_txt:       'expr.txt',
  expr_txt_degr:  'expr.txt_degr',
  expr_uid:       'uid(langvar2.lang_code,langvar2.var_code)',
  uid:            'uid(langvar.lang_code,langvar.var_code)',
}, DEFINITION_COLS, 'definition');

const ARRAY_PARAMS = ['expr','expr_langvar','expr_txt','expr_txt_degr','expr_uid','id','langvar','meaning','txt','txt_degr','uid'];

function init(app) {
  app.apiParam('definition', loadDefinition);

  app.apiRoute({ path: '/v2/definition', arrayParams: ARRAY_PARAMS, executeQuery: true }, params, definition);
  app.apiRoute({ path: '/v2/definition/count', arrayParams: ARRAY_PARAMS }, params, require('./count')('definition'));
  app.apiRoute({ path: '/v2/definition/:definition' });
}

function params(req, res, next) {
  if ('expr' in req.query || 'expr_langvar' in req.query || 'expr_uid' in req.query ||
      'expr_txt' in req.query || 'expr_txt_degr' in req.query)
  {
    req.get('state').expr = true;
  }

  next();
}

function query(req) {
  const q = knex('definition');
  req.selectCols(q, DEFINITION_COLS_MAP, DEFINITION_COLS);

  const knownQuery = req.get('knownQuery');
  const include = req.get('include');

  if (include.uid) {
    knownQuery.include.uid = true;
    q.join('langvar', 'langvar.id', 'definition.langvar');
    req.selectCol(q, DEFINITION_COLS_MAP, 'uid');
  }

  if (req.get('state').expr) {
    q
      .join('meaning', 'meaning.id', 'definition.meaning')
      .join('denotation', 'denotation.meaning', 'meaning.id');
    req.selectCols(q, DEFINITION_COLS_MAP, ['expr']);

    if (include.expr_langvar) {
      knownQuery.include.expr_langvar = true;
      req.ensureJoin(q, 'expr', 'expr.id', 'denotation.expr');
      req.selectCol(q, DEFINITION_COLS_MAP, 'expr_langvar');
    }

    if (include.expr_uid) {
      knownQuery.include.expr_uid = true;
      req.ensureJoin(q, 'expr', 'expr.id', 'denotation.expr');
      q.join('langvar as langvar2', 'langvar2.id', 'expr.langvar')
      req.selectCol(q, DEFINITION_COLS_MAP, 'expr_uid');
    }

    if (include.expr_txt) {
      knownQuery.include.expr_txt = true;
      req.ensureJoin(q, 'expr', 'expr.id', 'denotation.expr');
      req.selectCol(q, DEFINITION_COLS_MAP, 'expr_txt');
    }

    if (include.expr_txt_degr) {
      knownQuery.include.expr_txt_degr = true;
      req.ensureJoin(q, 'expr', 'expr.id', 'denotation.expr')
      req.selectCol(q, DEFINITION_COLS_MAP, 'expr_txt_degr');
    }
  }

  return q;
}

function conditions(req, q, counting) {
  const knownQuery = req.get('knownQuery');
  let numParams = 0;

  if ('id' in req.query) {
    knownQuery.id = true;
    q.where('definition.id', array.id(req.query.id, 'id'));
    numParams++;
  }

  if ('meaning' in req.query) {
    knownQuery.meaning = true;
    q.where('definition.meaning', array.id(req.query.meaning, 'meaning'));
    numParams++;
  }

  if ('langvar' in req.query) {
    knownQuery.langvar = true;
    q.where('definition.langvar', array.id(req.query.langvar, 'langvar'));
    numParams++;
  }

  if ('uid' in req.query) {
    knownQuery.uid = true;
    q.where('definition.langvar', ...array.uidLangvar(req.query.uid, 'uid'));
    numParams++;
  }

  if ('txt' in req.query) {
    knownQuery.txt = true;
    q.where('definition.txt', array.txtNFC(req.query.txt, 'txt'));
    numParams++;
  }

  if ('txt_degr' in req.query) {
    knownQuery.txt_degr = true;
    q.where('definition.txt_degr', ...array.txtDegr(req.query.txt_degr, 'txt_degr'));
    numParams++;
  }

  if (req.get('state').expr) {
    if (counting) {
      q
        .join('meaning', 'meaning.id', 'definition.meaning')
        .join('denotation', 'denotation.meaning', 'meaning.id');
    }

    if ('expr' in req.query) {
      knownQuery.expr = true;
      q.where('denotation.expr', array.id(req.query.expr, 'expr'));
      numParams++;
    }

    if ('expr_langvar' in req.query) {
      knownQuery.expr_langvar = true;
      req.ensureJoin(q, 'expr', 'expr.id', 'denotation.expr')
      q.where('expr.langvar', array.id(req.query.expr_langvar, 'expr_langvar'));
      numParams++;
    }

    if ('expr_uid' in req.query) {
      knownQuery.expr_uid = true;
      req.ensureJoin(q, 'expr', 'expr.id', 'denotation.expr');
      q.where('expr.langvar', ...array.uidLangvar(req.query.expr_uid, 'expr_uid'));
      numParams++;
    }

    if ('expr_txt' in req.query) {
      knownQuery.expr_txt = true;
      req.ensureJoin(q, 'expr', 'expr.id', 'denotation.expr');
      q.where('expr.txt', array.txtNFC(req.query.expr_txt, 'expr_txt'));
      numParams++;
    }

    if ('expr_txt_degr' in req.query) {
      knownQuery.expr_txt_degr = true;
      req.ensureJoin(q, 'expr', 'expr.id', 'denotation.expr');
      q.where('expr.txt_degr', ...array.txtDegr(req.query.expr_txt_degr, 'expr_txt_degr'));
      numParams++;
    }

  }

  return numParams;
}

function loadDefinition(req, res, next, definition) {
  if (definition.match(/^\d+$/)) {
    query(req).where('definition.id', definition)
    .first().then(row => {
      if (!row) next(new errors.ResourceNotFoundError(`definition ${definition} was not found`));
      else {
        req.get('obj').definition = row;
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

  req.applyGlobalParams(q, DEFINITION_COLS_MAP, 'id', 'definition', 'you must specify at least one search parameter');

  const obj = req.get('obj');
  obj.resultType = 'definition';
  next();
}

module.exports = {
  init: init,
  conditions: conditions,
  query: query
};
