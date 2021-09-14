const array = require('../../lib/array');
const knex = require('../../lib/db');
const validate = require('../../lib/validate');
const finalizeColMap = require('../../lib/col_map');

const errors = require('restify-errors');

const EXPR_COLS = ['ex','lv','tt','td'];

const EXPR_COLS_MAP = finalizeColMap({
  exsc:     'exprx.score',
  trex:     'denotationsrc.ex',
  trlv:  'denotationsrc.lv',
  trtt:      'exprsrc.tt',
  trtd: 'exprsrc.td',
  truid:      'uid(langvarsrc.lc,langvarsrc.vc)',
  trq:  'trq',
  uid:            'uid(lv.lc,lv.vc)',
}, EXPR_COLS, 'ex');

const ARRAY_PARAMS = ['ex','im1ui','im1exlv','im1exuid','im1ap','lc','lv','trex','trui','trlv','trap','trtt','trtd','truid','tt','td','uid'];

function init(app) {
  app.apiParam('ex', loadExpr);

  app.apiRoute({ path: '/ex', arrayParams: ARRAY_PARAMS, executeQuery: true }, params, expr);
  app.apiRoute({ path: '/ex/count', arrayParams: ARRAY_PARAMS }, params, require('./count')('ex'));
  app.apiRoute({ path: '/ex/index', arrayParams: ['lv','uid'] }, exprIndex);
  app.apiRoute({ path: '/ex/:ex' });
  app.apiRoute({ path: '/ex/:lv/:extt' }, exprOneLangvarTxt);
}

function params(req, res, next) {
  if ('trex' in req.query || 'trlv' in req.query || 'truid' in req.query ||
      'trtt' in req.query || 'trtd' in req.query)
  {
    const knownQuery = req.get('knownQuery');
    const state = req.get('state');
    state.trans = true;

    if ('trdistance' in req.query) {
      knownQuery.trdistance = true;
      validate.positiveInteger(req.query.trdistance, 'trdistance');

      if (req.query.trdistance > 2)
        return next(new errors.InvalidArgumentError('the parameter "trdistance" must be 1 or 2'));

      state.trdistance = req.query.trdistance;
    }
    else state.trdistance = 1;

    if ('trqmin' in req.query) {
      knownQuery.trqmin = true;
      validate.nonNegativeInteger(req.query.trqmin, 'trqmin');
      state.trqmin = req.query.trqmin;
    }
    else state.trqmin = 0;

    if ('trqalgo' in req.query) {
      knownQuery.trqalgo = true;
      validate.string(req.query.trqalgo, 'trqalgo');

      if (req.query.trqalgo !== 'geometric' && req.query.trqalgo !== 'arithmetic')
        return next(new errors.InvalidArgumentError('the parameter "trqalgo" must be "geometric" or "arithmetic"'));

      state.trqalgo = req.query.trqalgo;
    }
    else state.trqalgo = 'geometric';

    if ('traq' in req.query) {
      knownQuery.traq = true;
      validate.nonNegativeInteger(req.query.traq, 'traq');
      if (req.query.traq > 9)
        return next(new errors.InvalidArgumentError('the parameter "traq" must be an integer in the range from 0 to 9'));
      state.traq = req.query.traq;
    }
  }

  next();
}

function query(req) {
  const q = knex('ex');
  req.selectCols(q, EXPR_COLS_MAP, EXPR_COLS);

  const knownQuery = req.get('knownQuery');
  const include = req.get('include');

  if (include.uid) {
    knownQuery.include.uid = true;
    req.ensureJoin(q, 'lv', 'lv.lv', 'ex.lv');
    req.selectCol(q, EXPR_COLS_MAP, 'uid');
  }

  if (include.exsc) {
    knownQuery.include.exsc = true;
    q.join('exprx', 'ex.ex', 'exprx.ex');
    req.selectCol(q, EXPR_COLS_MAP, 'exsc');
  }

  const state = req.get('state');

  if (state.trans) {
    joinTrans(req, q);

    req.selectCols(q, EXPR_COLS_MAP, ['trex']);
    req.groupBy(q, 'denotationsrc.ex');

    if (include.uid) req.groupBy(q, 'lv.lc', 'lv.vc');
    if (include.exsc) req.groupBy(q, 'exprx.score');

    if (include.trpath) {
      knownQuery.include.trpath = true;
      if (state.trdistance === 1) {
        q.select(knex.raw("array_agg(json_build_array(json_build_object('mn', denotationsrc.mn, 'ap', denotationsrc.ap, 'dn1', denotationsrc.ex, 'dn2', dn.dn))) as trpath"));
      }
      else {
        q.select(knex.raw("array_agg(json_build_array(json_build_object('mn', denotationsrc.mn, 'ap', denotationsrc.ap, 'dn1', denotationsrc.ex, 'dn2', dn2.dn, 'ex2', dn2.ex, 'lv2', dn2.lv), json_build_object('mn', dn.mn, 'ap', dn.ap, 'dn1', dn3.dn, 'dn2', dn.dn))) as trpath"));
      }
    }

    if (include.trlv) {
      knownQuery.include.trlv = true;
      req.selectCol(q, EXPR_COLS_MAP, 'trlv');
      req.groupBy(q, 'denotationsrc.lv');
    }

    if (include.truid) {
      knownQuery.include.truid = true;
      req.ensureJoin(q, 'lv as langvarsrc', 'langvarsrc.ex', 'denotationsrc.lv');
      req.selectCol(q, EXPR_COLS_MAP, 'truid');
      req.groupBy(q, 'langvarsrc.lc', 'langvarsrc.vc');
    }

    if (include.trtt) {
      knownQuery.include.trtt = true;
      req.ensureJoin(q, 'ex as exprsrc', 'exprsrc.ex', 'denotationsrc.ex');
      req.selectCol(q, EXPR_COLS_MAP, 'trtt');
      req.groupBy(q, 'exprsrc.tt');
    }

    if (include.trtd) {
      knownQuery.include.trtd = true;
      req.ensureJoin(q, 'ex as exprsrc', 'exprsrc.ex', 'denotationsrc.ex');
      req.selectCol(q, EXPR_COLS_MAP, 'trtd');
      req.groupBy(q, 'exprsrc.td');
    }

    if (include.trq) {
      knownQuery.include.trq = true;
      req.get('sortable').trq = true;
      q.select(knex.raw(transQuality(state.trdistance, state.trqalgo) + ' as trq'));
    }
  }

  return q;
}

function joinTrans(req, q) {
  const state = req.get('state');
  const knownQuery = req.get('knownQuery');

  q.join('dnx as dn', 'dn.ex', 'ex.ex');

  if (state.trdistance === 1) {
    q.join('dnx as denotationsrc', function () {
      this.on('denotationsrc.mn', 'dn.mn')
        .andOn('denotationsrc.ex', '!=', 'dn.ex');
    });
  }
  else {
    let diff_langvar;
    if ('im1exdiflv' in req.query) {
      knownQuery.im1exdiflv = true;
      validate.bool(req.query.im1exdiflv, 'im1exdiflv');
      diff_langvar = req.query.im1exdiflv;
    }
    else diff_langvar = false;

    q
      .join('dnx as dn2', function () {
        this.on('dn2.mn', 'dn.mn');
        if (diff_langvar) this.andOn('dn2.lv', '!=', 'dn.lv');
        else this.andOn('dn2.ex', '!=', 'dn.ex');
      })
      .join('dnx as dn3', function () {
        this.on('dn3.ex', 'dn2.ex');
        if ('traq' in state && state.traq > 0) {
          this.andOn('dn3.uq', '>=', state.traq);
        }
      })
      .join('dnx as denotationsrc', function () {
        this.on('denotationsrc.mn', 'dn3.mn')
          .andOn('denotationsrc.ui', '!=', 'dn.ui')
          .andOn('denotationsrc.ex', '!=', 'dn.ex');
        if (diff_langvar) this.andOn('denotationsrc.lv', '!=', 'dn3.lv');
        else this.andOn('denotationsrc.ex', '!=', 'dn3.ex');
      });
  }

  req.groupBy(q, 'ex.ex','ex.lv','ex.tt','ex.td');
}

function conditions(req, q, counting) {
  const knownQuery = req.get('knownQuery');
  let numParams = 0;

  if ('ex' in req.query) {
    knownQuery.ex = true;
    q.where('ex.ex', array.id(req.query.ex, 'ex'));
    numParams++;
  }

  if ('tt' in req.query) {
    knownQuery.tt = true;
    q.where('ex.tt', array.txtNFC(req.query.tt, 'tt'));
    numParams++;
  }

  if ('td' in req.query) {
    knownQuery.td = true;
    q.where('ex.td', ...array.txtDegr(req.query.td, 'td'));
    numParams++;
  }

  if ('lv' in req.query) {
    knownQuery.lv = true;
    q.where('ex.lv', array.id(req.query.lv, 'lv'));
    numParams++;
  }

  if ('uid' in req.query) {
    knownQuery.uid = true;
    q.where('ex.lv', ...array.uidLangvar(req.query.uid, 'uid'));
    numParams++;
  }

  if ('lc' in req.query) {
    knownQuery.lc = true;
    q.where('ex.lv', ...array.langCodeLangvar(req.query.lc));
    numParams++;
  }

  if ('range' in req.query) {
    knownQuery.range = true;
    const range = validate.range(req.query.range, ['tt', 'td']);

    const col = EXPR_COLS_MAP[range[0]].sqlExpr;
    if (range[0] === 'td') {
      range[1] = knex.raw('txt_degr(?)', [range[1]]);
      range[2] = knex.raw('txt_degr(?)', [range[2]]);
    }
    q.where(col, '>=', range[1]).where(col, '<=', range[2]);

    numParams++;
  }

  if ('mu' in req.query) {
    knownQuery.mu = true;
    req.query.mu = validate.bool(req.query.mu, 'mu');
    req.ensureJoin(q, 'lv', 'lv.lv', 'ex.lv');
    q.where('lv.mu', req.query.mu);
  }

  const state = req.get('state');

  if (state.trans) {
    let numTransParams = 0;
    let numExtraParams = 0;
    const transExprSubq = [];
    const transTxtQuery = 'trtt' in req.query || 'trtd' in req.query;

    if (counting) joinTrans(req, q);

    if ('trex' in req.query) {
      knownQuery.trex = true;
      if (transTxtQuery) {
        transExprSubq.push(['ex.ex', array.id(req.query.trex, 'trex')]);
      }
      else {
        q.where('denotationsrc.ex', array.id(req.query.trex, 'trex'));
      }
      numTransParams++;
    }

    if ('trlv' in req.query) {
      knownQuery.trlv = true;
      if (transTxtQuery) {
        transExprSubq.push(['ex.lv', array.id(req.query.trlv, 'trlv')]);
      }
      else {
        q.where('denotationsrc.lv', array.id(req.query.trlv, 'trlv'));
      }
      numExtraParams++;
    }

    if ('truid' in req.query) {
      knownQuery.truid = true;
      if (transTxtQuery) {
        transExprSubq.push(['ex.lv', ...array.uidLangvar(req.query.truid, 'truid')]);
      }
      else {
        q.where('denotationsrc.lv', ...array.uidLangvar(req.query.truid, 'truid'));
      }
      numExtraParams++;
    }

    if ('trtt' in req.query) {
      knownQuery.trtt = true;
      transExprSubq.push(['ex.tt', array.txtNFC(req.query.trtt, 'trtt')]);
      numTransParams++;
    }

    if ('trtd' in req.query) {
      knownQuery.trtd = true;
      transExprSubq.push(['ex.td', ...array.txtDegr(req.query.trtd, 'trtd')]);
      numTransParams++;
    }

    if ('trap' in req.query) {
      knownQuery.trap = true;
      q.where('denotationsrc.ap', array.id(req.query.trap, 'trap'));
    }

    if ('trui' in req.query) {
      knownQuery.trui = true;
      q.where('denotationsrc.ui', array.id(req.query.trui, 'trui'));
    }

    if (transExprSubq.length) {
      const subq = knex.select('ex.ex').from('ex');
      transExprSubq.forEach(item => {
        subq.where(...item);
      });
      q.whereIn('denotationsrc.ex', subq);
    }

    if (state.trqmin > 0) {
      q.having(knex.raw(transQuality(state.trdistance, state.trqalgo)), '>=', req.query.trqmin);
    }

    if ('traq' in state && state.traq > 0) {
      q.where('dn.uq', '>=', state.traq);
    }

    if (state.trdistance === 2) {
      if (numParams === 0 || numTransParams === 0) {
        throw new errors.InvalidArgumentError('when doing distance-2 translations, you must specify (1) at least one of the "ex", "lc", "lv", "range", "td", "tt", or "uid" parameters; and (2) at least one of of the "trex", "trtt", or "trtd" parameters');
      }

      if ('im1ap' in req.query) {
        knownQuery.im1ap = true;
        q.where('dn.ap', array.id(req.query.im1ap, 'im1ap'));
      }

      if ('im1ui' in req.query) {
        knownQuery.im1ui = true;
        q.where('dn.ui', array.id(req.query.im1ui, 'im1ui'));
      }

      if ('im1exlv' in req.query) {
        knownQuery.im1exlv = true;
        q.where('dn2.lv', array.id(req.query.im1exlv, 'im1exlv'));
      }

      if ('im1exuid' in req.query) {
        knownQuery.im1exuid = true;
        q.where('dn2.lv', ...array.uidLangvar(req.query.im1exuid, 'im1exuid'));
      }

    }

    numParams += numTransParams + numExtraParams;
  }

  return numParams;
}

function transQuality(trans_distance, trans_quality_algo) {
  if (trans_distance === 1) {
    return 'grp_quality_score(array_agg(dn.ui), array_agg(dn.uq))';
  }
  else {
    if (trans_quality_algo === 'geometric') return 'grp_quality_expr_score_geo2(array_agg(dn.ui), array_agg(denotationsrc.ui), array_agg(dn.uq), array_agg(denotationsrc.uq), array_agg(dn2.ex))';
    else return 'grp_quality_score(array_agg(dn.ui) || array_agg(denotationsrc.ui), array_agg(dn.uq) || array_agg(denotationsrc.uq))';
  }
}

function loadExpr(req, res, next, expr) {
  if (expr.match(/^\d+$/)) {
    query(req).where('ex.ex', expr)
    .first().then(row => {
      if (!row) next(new errors.ResourceNotFoundError(`expression ${expr} was not found`));
      else {
        req.get('obj').ex = row;
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

  req.applyGlobalParams(q, EXPR_COLS_MAP, 'ex', 'expr', 'you must specify at least one search parameter (other than "mu" and "interm1*" parameters)');

  const obj = req.get('obj');
  obj.resultType = 'ex';
  next();
}

function exprOneLangvarTxt(req, res, next) {
  const obj = req.get('obj');

  query(req).where({ 'ex.lv': obj.lv.lv, 'ex.tt': req.params.exprtxt })
  .first().then(row => {
    if (!row) next(new errors.ResourceNotFoundError(`expression "${req.params.exprtxt}" in variety ${req.params.lv} was not found`));
    else {
      obj.ex = row;
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

  const subq = knex('ex').select(EXPR_COLS); //.where({ tt: { '<>' : '' } });

  const knownQuery = req.get('knownQuery');
  knownQuery.step = true;

  if ('lv' in req.query) {
    knownQuery.lv = true;
    subq.where('ex.lv', array.id(req.query.lv, 'lv'));
  }

  if ('uid' in req.query) {
    knownQuery.uid = true;
    subq.where('ex.lv', ...array.uidLangvar(req.query.uid, 'uid'));
  }

  const q = knex.select('ex', 'lv', 'tt', 'td')
    .from(subq.clone().select(knex.raw('row_number() over (ORDER BY ex.td) as num'))
      .orderBy('ex.td').as('a'))
    .where('a.num', 1).orWhere(knex.raw('mod(a.num-1,?)', [step]), 0).orWhere(knex.raw('mod(a.num,?)', [step]), 0)
    .unionAll(subq.clone().orderBy('td', 'desc').limit(1), true);

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
