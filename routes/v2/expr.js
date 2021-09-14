const array = require('../../lib/array');
const knex = require('../../lib/db');
const validate = require('../../lib/validate');
const finalizeColMap = require('../../lib/col_map');

const errors = require('restify-errors');

const EXPR_COLS = ['id','langvar','txt','txt_degr'];

const EXPR_COLS_MAP = finalizeColMap({
  expr_score:     'exprx.score',
  trans_expr:     'denotationsrc.expr',
  trans_langvar:  'denotationsrc.langvar',
  trans_txt:      'exprsrc.txt',
  trans_txt_degr: 'exprsrc.txt_degr',
  trans_uid:      'uid(langvarsrc.lang_code,langvarsrc.var_code)',
  trans_quality:  'trans_quality',
  uid:            'uid(langvar.lang_code,langvar.var_code)',
}, EXPR_COLS, 'expr');

const ARRAY_PARAMS = ['id','interm1_grp','interm1_expr_langvar','interm1_expr_uid','interm1_source','lang_code','langvar','trans_expr','trans_grp','trans_langvar','trans_source','trans_txt','trans_txt_degr','trans_uid','txt','txt_degr','uid'];

function init(app) {
  app.apiParam('expr', loadExpr);

  app.apiRoute({ path: '/v2/expr', arrayParams: ARRAY_PARAMS, executeQuery: true }, params, expr);
  app.apiRoute({ path: '/v2/expr/count', arrayParams: ARRAY_PARAMS }, params, require('./count')('expr'));
  app.apiRoute({ path: '/v2/expr/index', arrayParams: ['langvar','uid'] }, exprIndex);
  app.apiRoute({ path: '/v2/expr/:expr' });
  app.apiRoute({ path: '/v2/expr/:langvar/:exprtxt' }, exprOneLangvarTxt);
}

function params(req, res, next) {
  if ('trans_expr' in req.query || 'trans_langvar' in req.query || 'trans_uid' in req.query ||
      'trans_txt' in req.query || 'trans_txt_degr' in req.query)
  {
    const knownQuery = req.get('knownQuery');
    const state = req.get('state');
    state.trans = true;

    if ('trans_distance' in req.query) {
      knownQuery.trans_distance = true;
      validate.positiveInteger(req.query.trans_distance, 'trans_distance');

      if (req.query.trans_distance > 2)
        return next(new errors.InvalidArgumentError('the parameter "trans_distance" must be 1 or 2'));

      state.trans_distance = req.query.trans_distance;
    }
    else state.trans_distance = 1;

    if ('trans_quality_min' in req.query) {
      knownQuery.trans_quality_min = true;
      validate.nonNegativeInteger(req.query.trans_quality_min, 'trans_quality_min');
      state.trans_quality_min = req.query.trans_quality_min;
    }
    else state.trans_quality_min = 0;

    if ('trans_quality_algo' in req.query) {
      knownQuery.trans_quality_algo = true;
      validate.string(req.query.trans_quality_algo, 'trans_quality_algo');

      if (req.query.trans_quality_algo !== 'geometric' && req.query.trans_quality_algo !== 'arithmetic')
        return next(new errors.InvalidArgumentError('the parameter "trans_quality_algo" must be "geometric" or "arithmetic"'));

      state.trans_quality_algo = req.query.trans_quality_algo;
    }
    else state.trans_quality_algo = 'geometric';

    if ('trans_source_quality_min' in req.query) {
      knownQuery.trans_source_quality_min = true;
      validate.nonNegativeInteger(req.query.trans_source_quality_min, 'trans_source_quality_min');
      if (req.query.trans_source_quality_min > 9)
        return next(new errors.InvalidArgumentError('the parameter "trans_source_quality_min" must be an integer in the range from 0 to 9'));
      state.trans_source_quality_min = req.query.trans_source_quality_min;
    }
  }

  next();
}

function query(req) {
  const q = knex('expr');
  req.selectCols(q, EXPR_COLS_MAP, EXPR_COLS);

  const knownQuery = req.get('knownQuery');
  const include = req.get('include');

  if (include.uid) {
    knownQuery.include.uid = true;
    req.ensureJoin(q, 'langvar', 'langvar.id', 'expr.langvar');
    req.selectCol(q, EXPR_COLS_MAP, 'uid');
  }

  if (include.expr_score) {
    knownQuery.include.expr_score = true;
    q.join('exprx', 'expr.id', 'exprx.id');
    req.selectCol(q, EXPR_COLS_MAP, 'expr_score');
  }

  const state = req.get('state');

  if (state.trans) {
    joinTrans(req, q);

    req.selectCols(q, EXPR_COLS_MAP, ['trans_expr']);
    req.groupBy(q, 'denotationsrc.expr');

    if (include.uid) req.groupBy(q, 'langvar.lang_code', 'langvar.var_code');
    if (include.expr_score) req.groupBy(q, 'exprx.score');

    if (include.trans_path) {
      knownQuery.include.trans_path = true;
      if (state.trans_distance === 1) {
        q.select(knex.raw("array_agg(json_build_array(json_build_object('meaning', denotationsrc.meaning, 'source', denotationsrc.source, 'denotation1', denotationsrc.id, 'denotation2', denotation.id))) as trans_path"));
      }
      else {
        q.select(knex.raw("array_agg(json_build_array(json_build_object('meaning', denotationsrc.meaning, 'source', denotationsrc.source, 'denotation1', denotationsrc.id, 'denotation2', denotation2.id, 'expr2', denotation2.expr, 'langvar2', denotation2.langvar), json_build_object('meaning', denotation.meaning, 'source', denotation.source, 'denotation1', denotation3.id, 'denotation2', denotation.id))) as trans_path"));
      }
    }

    if (include.trans_langvar) {
      knownQuery.include.trans_langvar = true;
      req.selectCol(q, EXPR_COLS_MAP, 'trans_langvar');
      req.groupBy(q, 'denotationsrc.langvar');
    }

    if (include.trans_uid) {
      knownQuery.include.trans_uid = true;
      req.ensureJoin(q, 'langvar as langvarsrc', 'langvarsrc.id', 'denotationsrc.langvar');
      req.selectCol(q, EXPR_COLS_MAP, 'trans_uid');
      req.groupBy(q, 'langvarsrc.lang_code', 'langvarsrc.var_code');
    }

    if (include.trans_txt) {
      knownQuery.include.trans_txt = true;
      req.ensureJoin(q, 'expr as exprsrc', 'exprsrc.id', 'denotationsrc.expr');
      req.selectCol(q, EXPR_COLS_MAP, 'trans_txt');
      req.groupBy(q, 'exprsrc.txt');
    }

    if (include.trans_txt_degr) {
      knownQuery.include.trans_txt_degr = true;
      req.ensureJoin(q, 'expr as exprsrc', 'exprsrc.id', 'denotationsrc.expr');
      req.selectCol(q, EXPR_COLS_MAP, 'trans_txt_degr');
      req.groupBy(q, 'exprsrc.txt_degr');
    }

    if (include.trans_quality) {
      knownQuery.include.trans_quality = true;
      req.get('sortable').trans_quality = true;
      q.select(knex.raw(transQuality(state.trans_distance, state.trans_quality_algo) + ' as trans_quality'));
    }
  }

  return q;
}

function joinTrans(req, q) {
  const state = req.get('state');
  const knownQuery = req.get('knownQuery');

  q.join('denotationx as denotation', 'denotation.expr', 'expr.id');

  if (state.trans_distance === 1) {
    q.join('denotationx as denotationsrc', function () {
      this.on('denotationsrc.meaning', 'denotation.meaning')
        .andOn('denotationsrc.expr', '!=', 'denotation.expr');
    });
  }
  else {
    let diff_langvar;
    if ('interm1_expr_diff_langvar' in req.query) {
      knownQuery.interm1_expr_diff_langvar = true;
      validate.bool(req.query.interm1_expr_diff_langvar, 'interm1_expr_diff_langvar');
      diff_langvar = req.query.interm1_expr_diff_langvar;
    }
    else diff_langvar = false;

    q
      .join('denotationx as denotation2', function () {
        this.on('denotation2.meaning', 'denotation.meaning');
        if (diff_langvar) this.andOn('denotation2.langvar', '!=', 'denotation.langvar');
        else this.andOn('denotation2.expr', '!=', 'denotation.expr');
      })
      .join('denotationx as denotation3', function () {
        this.on('denotation3.expr', 'denotation2.expr');
        if ('trans_source_quality_min' in state && state.trans_source_quality_min > 0) {
          this.andOn('denotation3.quality', '>=', state.trans_source_quality_min);
        }
      })
      .join('denotationx as denotationsrc', function () {
        this.on('denotationsrc.meaning', 'denotation3.meaning')
          .andOn('denotationsrc.grp', '!=', 'denotation.grp')
          .andOn('denotationsrc.expr', '!=', 'denotation.expr');
        if (diff_langvar) this.andOn('denotationsrc.langvar', '!=', 'denotation3.langvar');
        else this.andOn('denotationsrc.expr', '!=', 'denotation3.expr');
      });
  }

  req.groupBy(q, 'expr.id');
}

function conditions(req, q, counting) {
  const knownQuery = req.get('knownQuery');
  let numParams = 0;

  if ('id' in req.query) {
    knownQuery.id = true;
    q.where('expr.id', array.id(req.query.id, 'id'));
    numParams++;
  }

  if ('txt' in req.query) {
    knownQuery.txt = true;
    q.where('expr.txt', array.txtNFC(req.query.txt, 'txt'));
    numParams++;
  }

  if ('txt_degr' in req.query) {
    knownQuery.txt_degr = true;
    q.where('expr.txt_degr', ...array.txtDegr(req.query.txt_degr, 'txt_degr'));
    numParams++;
  }

  if ('langvar' in req.query) {
    knownQuery.langvar = true;
    q.where('expr.langvar', array.id(req.query.langvar, 'langvar'));
    numParams++;
  }

  if ('uid' in req.query) {
    knownQuery.uid = true;
    q.where('expr.langvar', ...array.uidLangvar(req.query.uid, 'uid'));
    numParams++;
  }

  if ('lang_code' in req.query) {
    knownQuery.lang_code = true;
    q.where('expr.langvar', ...array.langCodeLangvar(req.query.lang_code));
    numParams++;
  }

  if ('range' in req.query) {
    knownQuery.range = true;
    const range = validate.range(req.query.range, ['txt', 'txt_degr']);

    const col = EXPR_COLS_MAP[range[0]].sqlExpr;
    if (range[0] === 'txt_degr') {
      range[1] = knex.raw('txt_degr(?)', [range[1]]);
      range[2] = knex.raw('txt_degr(?)', [range[2]]);
    }
    q.where(col, '>=', range[1]).where(col, '<=', range[2]);

    numParams++;
  }

  if ('mutable' in req.query) {
    knownQuery.mutable = true;
    req.query.mutable = validate.bool(req.query.mutable, 'mutable');
    req.ensureJoin(q, 'langvar', 'langvar.id', 'expr.langvar');
    q.where('langvar.mutable', req.query.mutable);
  }

  const state = req.get('state');

  if (state.trans) {
    let numTransParams = 0;
    let numExtraParams = 0;
    const transExprSubq = [];
    const transTxtQuery = 'trans_txt' in req.query || 'trans_txt_degr' in req.query;

    if (counting) joinTrans(req, q);

    if ('trans_expr' in req.query) {
      knownQuery.trans_expr = true;
      if (transTxtQuery) {
        transExprSubq.push(['expr.id', array.id(req.query.trans_expr, 'trans_expr')]);
      }
      else {
        q.where('denotationsrc.expr', array.id(req.query.trans_expr, 'trans_expr'));
      }
      numTransParams++;
    }

    if ('trans_langvar' in req.query) {
      knownQuery.trans_langvar = true;
      if (transTxtQuery) {
        transExprSubq.push(['expr.langvar', array.id(req.query.trans_langvar, 'trans_langvar')]);
      }
      else {
        q.where('denotationsrc.langvar', array.id(req.query.trans_langvar, 'trans_langvar'));
      }
      numExtraParams++;
    }

    if ('trans_uid' in req.query) {
      knownQuery.trans_uid = true;
      if (transTxtQuery) {
        transExprSubq.push(['expr.langvar', ...array.uidLangvar(req.query.trans_uid, 'trans_uid')]);
      }
      else {
        q.where('denotationsrc.langvar', ...array.uidLangvar(req.query.trans_uid, 'trans_uid'));
      }
      numExtraParams++;
    }

    if ('trans_txt' in req.query) {
      knownQuery.trans_txt = true;
      transExprSubq.push(['expr.txt', array.txtNFC(req.query.trans_txt, 'trans_txt')]);
      numTransParams++;
    }

    if ('trans_txt_degr' in req.query) {
      knownQuery.trans_txt_degr = true;
      transExprSubq.push(['expr.txt_degr', ...array.txtDegr(req.query.trans_txt_degr, 'trans_txt_degr')]);
      numTransParams++;
    }

    if ('trans_source' in req.query) {
      knownQuery.trans_source = true;
      q.where('denotationsrc.source', array.id(req.query.trans_source, 'trans_source'));
    }

    if ('trans_grp' in req.query) {
      knownQuery.trans_grp = true;
      q.where('denotationsrc.grp', array.id(req.query.trans_grp, 'trans_grp'));
    }

    if (transExprSubq.length) {
      const subq = knex.select('expr.id').from('expr');
      transExprSubq.forEach(item => {
        subq.where(...item);
      });
      q.whereIn('denotationsrc.expr', subq);
    }

    if (state.trans_quality_min > 0) {
      q.having(knex.raw(transQuality(state.trans_distance, state.trans_quality_algo)), '>=', req.query.trans_quality_min);
    }

    if ('trans_source_quality_min' in state && state.trans_source_quality_min > 0) {
      q.where('denotation.quality', '>=', state.trans_source_quality_min);
    }

    if (state.trans_distance === 2) {
      if (numParams === 0 || numTransParams === 0) {
        throw new errors.InvalidArgumentError('when doing distance-2 translations, you must specify (1) at least one of the "expr", "lang_code", "langvar", "range", "txt_degr", "txt", or "uid" parameters; and (2) at least one of of the "trans_expr", "trans_txt", or "trans_txt_degr" parameters');
      }

      if ('interm1_source' in req.query) {
        knownQuery.interm1_source = true;
        q.where('denotation.source', array.id(req.query.interm1_source, 'interm1_source'));
      }

      if ('interm1_grp' in req.query) {
        knownQuery.interm1_grp = true;
        q.where('denotation.grp', array.id(req.query.interm1_grp, 'interm1_grp'));
      }

      if ('interm1_expr_langvar' in req.query) {
        knownQuery.interm1_expr_langvar = true;
        q.where('denotation2.langvar', array.id(req.query.interm1_expr_langvar, 'interm1_expr_langvar'));
      }

      if ('interm1_expr_uid' in req.query) {
        knownQuery.interm1_expr_uid = true;
        q.where('denotation2.langvar', ...array.uidLangvar(req.query.interm1_expr_uid, 'interm1_expr_uid'));
      }

    }

    numParams += numTransParams + numExtraParams;
  }

  return numParams;
}

function transQuality(trans_distance, trans_quality_algo) {
  if (trans_distance === 1) {
    return 'grp_quality_score(array_agg(denotation.grp), array_agg(denotation.quality))';
  }
  else {
    if (trans_quality_algo === 'geometric') return 'grp_quality_expr_score_geo2(array_agg(denotation.grp), array_agg(denotationsrc.grp), array_agg(denotation.quality), array_agg(denotationsrc.quality), array_agg(denotation2.expr))';
    else return 'grp_quality_score(array_agg(denotation.grp) || array_agg(denotationsrc.grp), array_agg(denotation.quality) || array_agg(denotationsrc.quality))';
  }
}

function loadExpr(req, res, next, expr) {
  if (expr.match(/^\d+$/)) {
    query(req).where('expr.id', expr)
    .first().then(row => {
      if (!row) next(new errors.ResourceNotFoundError(`expression ${expr} was not found`));
      else {
        req.get('obj').expr = row;
        next();
      }
    }).catch(err => {
      next(new errors.InternalError(err.message || err));
    });
  }
  else next(new errors.InvalidArgumentError('the expression must be specified as a numeric id'));
}

function expr(req, res, next) {
  const q = query(req);
  req.set('numParams', conditions(req, q));

  req.applyGlobalParams(q, EXPR_COLS_MAP, 'id', 'expr', 'you must specify at least one search parameter (other than "mutable" and "interm1*" parameters)');

  const obj = req.get('obj');
  obj.resultType = 'expr';
  next();
}

function exprOneLangvarTxt(req, res, next) {
  const obj = req.get('obj');

  query(req).where({ 'expr.langvar': obj.langvar.id, 'expr.txt': req.params.exprtxt })
  .first().then(row => {
    if (!row) next(new errors.ResourceNotFoundError(`expression "${req.params.exprtxt}" in variety ${req.params.langvar} was not found`));
    else {
      obj.expr = row;
      next();
    }
  }).catch(err => {
    next(new errors.InternalError(err.message || err));
  });
}

function exprIndex(req, res, next) {
  if (!('step' in req.query)) return next(new errors.MissingParameterError('the parameter "step" is required'));
  const step = req.query.step;
  validate.positiveInteger(step, 'step');
  if (step < 250) return next(new errors.InvalidArgumentError('the parameter "step" must be 250 or higher'));

  const subq = knex('expr').select(EXPR_COLS); //.where({ txt: { '<>' : '' } });

  const knownQuery = req.get('knownQuery');
  knownQuery.step = true;

  if ('langvar' in req.query) {
    knownQuery.langvar = true;
    subq.where('expr.langvar', array.id(req.query.langvar, 'langvar'));
  }

  if ('uid' in req.query) {
    knownQuery.uid = true;
    subq.where('expr.langvar', ...array.uidLangvar(req.query.uid, 'uid'));
  }

  const q = knex.select('id', 'langvar', 'txt', 'txt_degr')
    .from(subq.clone().select(knex.raw('row_number() over (ORDER BY expr.txt_degr) as num'))
      .orderBy('expr.txt_degr').as('a'))
    .where('a.num', 1).orWhere(knex.raw('mod(a.num-1,?)', [step]), 0).orWhere(knex.raw('mod(a.num,?)', [step]), 0)
    .unionAll(subq.clone().orderBy('txt_degr', 'desc').limit(1), true);

  q.then(rows => {
    rows = rows || [];
    if (rows.length % 2 === 1) rows.pop();

    const index = [];
    for (let i = 0; i < rows.length; i += 2) index.push([rows[i], rows[i+1]]);

    const obj = req.get('obj');
    obj.index = index;
    req.set('jsonIndent', null);
    next();
  }).catch(err => {
    next(new errors.InternalError(err.message || err));
  });
}

module.exports = {
  init: init,
  conditions: conditions,
  query: query
};
