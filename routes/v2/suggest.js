const knex = require('../../lib/db');
const array = require('../../lib/array');
const lateral = require('../../lib/lateral');
const validate = require('../../lib/validate');

const errors = require('restify-errors');
const _ = require('lodash');

const ART_PANLEX = 0;
const UID_LANGVAR = 7257;
const BCP47_LANGVAR = 11890;

const SUGGEST_RESULT_MAX = 100;
const SUGGEST_RESULT_DEFAULT = 50;
const TRANS_RESULT_MAX = 10;
const TRANS_RESULT_DEFAULT = 3;

function init(app) {
  app.apiRoute({ path: '/v2/suggest/expr_trans', arrayParams: ['langvar', 'no_trans_langvar', 'pref_trans_langvar', 'sort_langvar', 'source'] }, exprTrans);
  app.apiRoute({ path: '/v2/suggest/langvar', arrayParams: ['pref_trans_langvar'] }, langvar);
}

const aggOrderBy = 'order by (word_boundary_match(tr.txt, :txt) and tr.ptl is not null) desc, word_boundary_match(tr.txt, :txt) desc, tr.txt_degr like :txtDegrMatch desc, tr.ptl is not null desc, tr.trans_quality desc, tr.txt_degr, tr.txt';

const orderByOuter1 = 'word_boundary_match(exprmatch.txt, :txt) desc, (bool_or(tr.ptl is not null and word_boundary_match(tr.txt, :txt))) desc, coalesce(bool_or(word_boundary_match(tr.txt, :txt)), false) desc, coalesce(bool_or(tr.txt_degr like :txtDegrMatch), false) desc';

const orderByOuter2 = `string_agg(tr.txt_degr, '' ${aggOrderBy}), string_agg(tr.txt, '' ${aggOrderBy})`;

function exprTrans(req, res, next) {
  if (!('txt' in req.query)) return next(new errors.MissingParameterError('the parameter "txt" is required'));
  validate.string(req.query.txt, 'txt');

  const knownQuery = req.get('knownQuery');
  const include = req.get('include');
  knownQuery.txt = knownQuery.pref_trans_langvar = true;

  const p = { txt: req.query.txt };

  if ('prefix' in req.query) {
    validate.bool(req.query.prefix, 'prefix');
    knownQuery.prefix = true;
  }

  const [ptlIntersect, ptlSortMatch] = getPrefTransLangvar(req.query, p);

  if ('source' in req.query) {
    p.source = array.id(req.query.source, 'source');
    knownQuery.source = true;
  }

  const noTransLangvar = [];

  if ('langvar' in req.query) {
    p.langvar = array.id(req.query.langvar, 'langvar');
    knownQuery.langvar = true;
    noTransLangvar.push(...req.query.langvar);
  }

  if ('no_trans_langvar' in req.query) {
    noTransLangvar.push(...req.query.no_trans_langvar);
    knownQuery.no_trans_langvar = true;
  }

  if (noTransLangvar.length) {
    p.noTransLangvar = array.notId(_.uniq(noTransLangvar), 'no_trans_langvar');
  }

  let sortLangvar;
  if (include.uid && 'sort_langvar' in req.query) {
    sortLangvar = knex.raw('array_position(?, exprmatch.langvar)', [req.query.sort_langvar]);
    knownQuery.sort_langvar = true;
  }

  let tq;
  if (include.trans_quality) {
    knownQuery.include.trans_quality = true;
    tq = ", 'trans_quality', tr.trans_quality";
  }
  else tq = '';

  if ('limit' in req.query) {
    validate.integer(req.query.limit, 'limit');
    knownQuery.limit = true;
  }
  const limit = getLimit(req.query.limit, SUGGEST_RESULT_MAX, SUGGEST_RESULT_DEFAULT);

  if ('trans_limit' in req.query) {
    validate.integer(req.query.trans_limit, 'trans_limit');
    knownQuery.trans_limit = true;
  }
  const transLimit = getLimit(req.query.trans_limit, TRANS_RESULT_MAX, TRANS_RESULT_DEFAULT);

  const agg = `array_agg(json_build_object('txt', tr.txt, 'pref_trans_langvar', tr.ptl${tq}) ${aggOrderBy}) filter (where tr.txt is not null) as trans`;

  const orderByInner = `(${ptlSortMatch} and word_boundary_match(exprtr.txt, :txt)) desc, word_boundary_match(exprtr.txt, :txt) desc, exprtr.txt_degr like :txtDegrMatch desc, ${ptlSortMatch} desc, trans_quality desc, exprtr.txt_degr, exprtr.txt`;

  const obj = req.get('obj');
  obj.suggestType = 'expr_trans';

  knex.from(knex.raw('txt_degr(?)', req.query.txt)).pluck('txt_degr')
  .then(txtDegr => {
    txtDegr = txtDegr[0];

    if (!txtDegr.length) {
      obj.suggest = [];
      return next();
    }

    p.txtDegrMatch = getTxtDegrMatch(txtDegr, req.query.prefix);

    let q, tr;

    if (include.uid) {
      knownQuery.include.uid = true;

      q = knex
      .select('exprmatch.id', 'exprmatch.txt', 'exprmatch.langvar', knex.raw('uid(langvar.lang_code, langvar.var_code)'), 'langvar_expr.txt as name_expr_txt', knex.raw(agg, p))
      .from(function () {
        this
        .select('expr.id', 'expr.txt', 'expr.langvar')
        .from('expr')
        .where('expr.txt_degr', 'like', p.txtDegrMatch);
        if (knownQuery.langvar) this.where('expr.langvar', p.langvar);

        this.union(function () {
          this
          .select('expr.id', 'expr.txt', 'expr.langvar')
          .from('expr as exprsrc')
          .join('denotationx as denotationsrc', function () {
            this.on('denotationsrc.expr', 'exprsrc.id');
            if (knownQuery.source) this.andOn('denotationsrc.source', p.source);
          })
          .join('denotationx as denotation', function () {
            this.on('denotation.meaning', 'denotationsrc.meaning').andOn('denotation.expr', '!=', 'denotationsrc.expr')
          })
          .join('expr', 'expr.id', 'denotation.expr')
          .where('exprsrc.txt_degr', 'like', p.txtDegrMatch);
          if (knownQuery.langvar) this.where('expr.langvar', p.langvar);
        });

        this.as('exprmatch');
      })
      .join('langvar', 'langvar.id', 'exprmatch.langvar')
      .join('expr as langvar_expr', 'langvar_expr.id', 'langvar.name_expr')
      .groupBy('exprmatch.id', 'exprmatch.langvar', 'exprmatch.txt', 'langvar.lang_code', 'langvar.var_code', 'langvar_expr.txt')
      .orderByRaw(orderByOuter1, p);

      if (sortLangvar) q.orderBy(sortLangvar);

      q
      .orderByRaw(orderByOuter2, p)
      .limit(limit);

      tr = knex
      .select('exprtr.txt', 'exprtr.txt_degr', knex.raw(`${ptlIntersect} as ptl`, p), knex.raw('grp_quality_score(array_agg(denotationtr.grp), array_agg(denotationtr.quality)) as trans_quality'))
      .from('expr')
      .join('denotationx as denotation', 'denotation.expr', 'expr.id')
      .join('denotationx as denotationtr', function () {
        this.on('denotationtr.meaning', 'denotation.meaning');
        if (knownQuery.source) this.andOn('denotationtr.source', p.source);
        if ('noTransLangvar' in p) this.andOn('denotationtr.langvar', '!=', p.noTransLangvar);
      })
      .join('expr as exprtr', 'exprtr.id', 'denotationtr.expr')
      .where('denotation.expr', knex.raw('exprmatch.id'))
      .groupBy('exprtr.txt', 'exprtr.txt_degr')
      .orderByRaw(orderByInner, p)
      .limit(transLimit);
    }
    else {
      q = knex.with('exprmatch', function () {
        this
        .select('expr.id', 'expr.txt')
        .from('expr')
        .where('expr.txt_degr', 'like', p.txtDegrMatch);
        if (knownQuery.langvar) this.where('expr.langvar', p.langvar);

        this.union(function () {
          this
          .select('expr.id', 'expr.txt')
          .from('expr as exprsrc')
          .join('denotationx as denotationsrc', function () {
            this.on('denotationsrc.expr', 'exprsrc.id');
            if (knownQuery.source) this.andOn('denotationsrc.source', p.source);
          })
          .join('denotationx as denotation', function () {
            this.on('denotation.meaning', 'denotationsrc.meaning').andOn('denotation.expr', '!=', 'denotationsrc.expr')
          })
          .join('expr', 'expr.id', 'denotation.expr')
          .where('exprsrc.txt_degr', 'like', p.txtDegrMatch);
          if (knownQuery.langvar) this.where('expr.langvar', p.langvar);
        });
      })
      .select('exprmatch.txt', knex.raw(agg, p))
      .from(function () {
        this.select('txt').distinct().from('exprmatch').as('exprmatch');
      })
      .groupBy('exprmatch.txt')
      .orderByRaw(orderByOuter1, p)
      .orderByRaw(orderByOuter2, p)
      .limit(limit);

      tr = knex
      .select('exprtr.txt', 'exprtr.txt_degr', knex.raw(`${ptlIntersect} as ptl`, p), knex.raw('grp_quality_score(array_agg(denotationtr.grp), array_agg(denotationtr.quality)) as trans_quality'))
      .from('expr')
      .join('denotationx as denotation', 'denotation.expr', 'expr.id')
      .join('denotationx as denotationtr', function () {
        this.on('denotationtr.meaning', 'denotation.meaning');
        if (knownQuery.source) this.andOn('denotationtr.source', p.source);
        if ('noTransLangvar' in p) this.andOn('denotationtr.langvar', '!=', p.noTransLangvar);
      })
      .join('expr as exprtr', 'exprtr.id', 'denotationtr.expr')
      .where('expr.txt', knex.raw('exprmatch.txt'))
      .whereExists(knex.raw('select 1 from exprmatch where exprmatch.id = expr.id'))
      .groupBy('exprtr.txt', 'exprtr.txt_degr')
      .orderByRaw(orderByInner, p)
      .limit(transLimit);
    }

    return lateral.leftJoin(q, tr, 'tr');
  }).then(rows => {
    obj.suggest = rows;
    next();
  }).catch(err => {
    next(new errors.InternalError(err.message || err));
  });
}

function langvar(req, res, next) {
  if (!('txt' in req.query)) return next(new errors.MissingParameterError('the parameter "txt" is required'));
  validate.string(req.query.txt, 'txt');

  const knownQuery = req.get('knownQuery');
  const include = req.get('include');
  knownQuery.txt = knownQuery.pref_trans_langvar = true;

  const p = { txt: req.query.txt };

  if ('limit' in req.query) {
    validate.integer(req.query.limit, 'limit');
    knownQuery.limit = true;
  }
  const limit = getLimit(req.query.limit, SUGGEST_RESULT_MAX, SUGGEST_RESULT_DEFAULT);

  if ('trans_limit' in req.query) {
    validate.integer(req.query.trans_limit, 'trans_limit');
    knownQuery.trans_limit = true;
  }
  const transLimit = getLimit(req.query.trans_limit, TRANS_RESULT_MAX, TRANS_RESULT_DEFAULT);

  if ('prefix' in req.query) {
    validate.bool(req.query.prefix, 'prefix');
    knownQuery.prefix = true;
  }

  const [ptlIntersect, ptlSortMatch] = getPrefTransLangvar(req.query, p);

  const obj = req.get('obj');
  obj.suggestType = 'langvar';

  knex.from(knex.raw('txt_degr(?)', req.query.txt)).pluck('txt_degr')
  .then(txtDegr => {
    p.txtDegr = txtDegr[0];

    if (!p.txtDegr.length) {
      obj.suggest = [];
      return next();
    }

    p.txtDegrMatch = getTxtDegrMatch(p.txtDegr, req.query.prefix);

    const q = knex
    .select('langvar.id', knex.raw('uid(langvar.lang_code,langvar.var_code)'), knex.raw("array_agg(json_build_object('txt', tr.txt, 'pref_trans_langvar', tr.ptl) order by tr.txt = langvar_expr.txt desc, (word_boundary_match(tr.txt, :txt) and tr.ptl is not null) desc, word_boundary_match(tr.txt, :txt) desc, tr.txt_degr like :txtDegrMatch desc, tr.ptl is not null desc, tr.txt_degr, tr.txt) filter (where tr.txt is not null) as trans", p))
    .from(function () {
      this
      .select('langvar.id')
      .distinct()
      .from('expr as exprsrc')
      .join('denotationx as denotationsrc', function () {
        this.on('denotationsrc.expr', 'exprsrc.id').andOn('denotationsrc.source', ART_PANLEX)
      })
      .join('denotationx as denotation', function () {
        this.on('denotation.meaning', 'denotationsrc.meaning').andOn('denotation.langvar', UID_LANGVAR)
      })
      .join('langvar as grp_member', 'grp_member.uid_expr', 'denotation.expr')
      .join('langvar', 'langvar.grp', 'grp_member.grp')
      .where('exprsrc.txt_degr', 'like', p.txtDegrMatch)
      .as('langvarmatch');
    })
    .join('langvar', 'langvar.id', 'langvarmatch.id')
    .join('expr as langvar_expr', 'langvar_expr.id', 'langvar.name_expr')
    .leftJoin('langvar_expr_count as lec', 'lec.langvar', 'langvar.id')
    .groupBy('langvar.id', 'langvar.lang_code', 'langvar.var_code', 'lec.count')
    .orderByRaw('word_boundary_match(uid(langvar.lang_code,langvar.var_code), :txt) desc', p)
    .orderByRaw('bool_or((tr.txt = langvar_expr.txt or tr.ptl is not null) and word_boundary_match(tr.txt, :txt)) desc', p)
    .orderByRaw('bool_or(tr.txt_degr = :txtDegr) desc', p)
    .orderByRaw('bool_or(word_boundary_match(tr.txt, :txt)) desc', p)
    .orderByRaw('bool_or(tr.txt_degr like :txtDegrMatch) desc', p)
    .orderByRaw('coalesce(lec.count, 0)::integer desc')
    .orderBy('uid')
    .limit(limit);

    ['grp','meaning','mutable','name_expr','region_expr','script_expr'].forEach(col => {
      if (include[col]) {
        q.select(`langvar.${col}`).groupBy(`langvar.${col}`);
        knownQuery.include[col] = true;
      }
    });

    if (include.expr_count) {
      q.select(knex.raw('coalesce(lec.count, 0)::integer as expr_count'));
      knownQuery.include.expr_count = true;
    }

    if (include.region_expr_langvar) {
      req.ensureJoin(q, 'expr as region_expr', 'region_expr.id', 'langvar.region_expr');
      q.select('region_expr.langvar as region_expr_langvar').groupBy('region_expr.langvar');
      knownQuery.include.region_expr_langvar = true;
    }

    if (include.region_expr_txt) {
      req.ensureJoin(q, 'expr as region_expr', 'region_expr.id', 'langvar.region_expr');
      q.select('region_expr.txt as region_expr_txt').groupBy('region_expr.txt');
      knownQuery.include.region_expr_txt = true;
    }

    if (include.script_expr_langvar) {
      req.ensureJoin(q, 'expr as script_expr', 'script_expr.id', 'langvar.script_expr');
      q.select('script_expr.langvar as script_expr_langvar').groupBy('script_expr.langvar');
      knownQuery.include.script_expr_langvar = true;
    }

    if (include.script_expr_txt) {
      req.ensureJoin(q, 'expr as script_expr', 'script_expr.id', 'langvar.script_expr');
      q.select('script_expr.txt as script_expr_txt').groupBy('script_expr.txt');
      knownQuery.include.script_expr_txt = true;
    }

    const tr = knex
      .select('denotationtr.txt', 'denotationtr.txt_degr', knex.raw(`${ptlIntersect} as ptl`, p))
      .from(function () {
        this
        .select('exprtr.txt', 'exprtr.txt_degr', 'exprtr.langvar')
        .from('langvar as langvartr')
        .join('denotationx as denotationtr', function () {
          this
          .on('denotationtr.meaning', 'langvartr.meaning')
          .andOn('denotationtr.langvar', '!=', knex.raw('all(?)', [[UID_LANGVAR, BCP47_LANGVAR]]));
        })
        .join('expr as exprtr', 'exprtr.id', 'denotationtr.expr')
        .where('langvartr.grp', knex.raw('langvar.grp'))
        .as('denotationtr');
      })
      .groupBy('denotationtr.txt', 'denotationtr.txt_degr')
      .orderByRaw('denotationtr.txt = langvar_expr.txt desc')
      .orderByRaw(`(${ptlSortMatch} and word_boundary_match(denotationtr.txt, :txt)) desc`, p)
      .orderByRaw('word_boundary_match(denotationtr.txt, :txt) desc', p)
      .orderByRaw('denotationtr.txt_degr like :txtDegrMatch desc', p)
      .orderByRaw(`${ptlSortMatch} desc`, p)
      .orderBy('denotationtr.txt_degr')
      .orderBy('denotationtr.txt')
      .limit(transLimit);

    return lateral.join(q, tr, 'tr');
  }).then(rows => {
    obj.suggest = rows;
    next();
  }).catch(err => {
    next(new errors.InternalError(err.message || err));
  });
}

function getTxtDegrMatch(txtDegr, prefix) {
  if (prefix) {
    return knex.raw("(? || '%')", txtDegr);
  }
  else if (txtDegr.length < 3) {
    return knex.raw("any(array[:td || '%', '%' || :td])", { td: txtDegr });
  }
  else {
    return knex.raw("('%' || ? || '%')", txtDegr);
  }
}

function getPrefTransLangvar(query, p) {
  let ptlIntersect, ptlSortMatch;

  if ('pref_trans_langvar' in query) {
    p.ptl = query.pref_trans_langvar;
    p.ptlMatch = array.id(p.ptl, 'pref_trans_langvar');

    if (p.ptl.length === 1) {
      p.ptl = p.ptl[0];
      ptlIntersect = '(case when bool_or(denotationtr.langvar = :ptl) then array[:ptl] else null end)';
      ptlSortMatch = 'bool_or(denotationtr.langvar = :ptl)';
    }
    else {
      ptlIntersect = "nullif(array_agg(denotationtr.langvar) OPERATOR(intarray.&) :ptl::smallint[], intarray.subarray('{}',0,0))";
      ptlSortMatch = `${ptlIntersect} is not null`;
    }
  }
  else {
    p.ptlMatch = null;
    ptlIntersect = 'null';
    ptlSortMatch = 'false';
  }

  return [ptlIntersect, ptlSortMatch];
}

function getLimit(val, max, def) {
  return _.max([_.min([val || def || max, max]), 1]);
}

module.exports = {
  init: init
};
