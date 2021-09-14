const array = require('../../lib/array');
const knex = require('../../lib/db');
const lateral = require('../../lib/lateral');
const validate = require('../../lib/validate');
const finalizeColMap = require('../../lib/col_map');

const errors = require('restify-errors');

const LANGVAR_COLS = ['grp','id','lang_code','meaning','mutable','name_expr','name_expr_txt','name_expr_txt_degr','region_expr','script_expr','uid','var_code'];

const LANGVAR_COLS_MAP = finalizeColMap({
  name_expr_txt:      'expr.txt',
  name_expr_txt_degr: 'expr.txt_degr',
  region_expr_langvar:'region_expr.langvar',
  region_expr_uid:    'uid(region_expr_langvar.lang_code,region_expr_langvar.var_code)',
  region_expr_txt:    'region_expr.txt',
  script_expr_txt:    'script_expr.txt',
  uid:                'uid(langvar.lang_code,langvar.var_code)',
}, LANGVAR_COLS, 'langvar');

const ARRAY_PARAMS = ['expr_txt','expr_txt_degr','grp','id','lang_code','meaning','name_expr','name_expr_txt','name_expr_txt_degr','region_expr','region_expr_langvar','region_expr_uid','region_expr_txt','script_expr','script_expr_txt','trans_expr','uid'];

const SCRIPT_LV = 6845; // art-262 = ISO 15924

function init(app) {
  app.apiParam('langvar', loadLangvar);

  app.apiRoute({ path: '/v2/langvar', arrayParams: ARRAY_PARAMS, executeQuery: true }, langvar);
  app.apiRoute({ path: '/v2/langvar/count', arrayParams: ARRAY_PARAMS }, require('./count')('langvar'));
  app.apiRoute({ path: '/v2/langvar/:langvar' });
}

function query(req) {
  const q = knex('langvar').join('expr', 'expr.id', 'langvar.name_expr');
  req.selectCols(q, LANGVAR_COLS_MAP, LANGVAR_COLS);

  const knownQuery = req.get('knownQuery');
  const include = req.get('include');

  if (include.langvar_char) {
    knownQuery.include.langvar_char = true;

    const subq = knex
      .select(knex.raw('array_agg(json_build_array(hex_to_integer(langvar_char.range_start), hex_to_integer(langvar_char.range_end)) ORDER BY hex_to_integer(langvar_char.range_start), hex_to_integer(langvar_char.range_end)) as val'))
      .from('langvar_char')
      .where('langvar_char.langvar', knex.raw('langvar.id'));

    lateral.leftJoin(q, subq, 'langvar_char');
    q.select(knex.raw("coalesce(langvar_char.val, '{}') as langvar_char"));
  }

  if (include.langvar_cldr_char) {
    knownQuery.include.langvar_cldr_char = true;

    const subq = knex
      .select(knex.raw("array_agg(json_build_object('range',json_build_array(hex_to_integer(langvar_cldr_char.range_start), hex_to_integer(langvar_cldr_char.range_end)),'locale',langvar_cldr_char.locale,'category',langvar_cldr_char.variable) ORDER BY hex_to_integer(langvar_cldr_char.range_start), hex_to_integer(langvar_cldr_char.range_end)) as val"))
      .from('langvar_cldr_char')
      .where('langvar_cldr_char.langvar', knex.raw('langvar.id'));

    lateral.leftJoin(q, subq, 'langvar_cldr_char');
    q.select(knex.raw("coalesce(langvar_cldr_char.val, '{}') as langvar_cldr_char"));
  }

  if (include.denotation_count) {
    knownQuery.include.denotation_count = true;
    q.select(function () {
      this.count().from('denotationx').where('denotationx.langvar', knex.raw('langvar.id')).as('denotation_count');
    });
  }

  if (include.expr_count) {
    knownQuery.include.expr_count = true;
    q.select(function () {
      this.count().from('expr').where('expr.langvar', knex.raw('langvar.id')).as('expr_count');
    });
  }

  if (include.script_expr_txt) {
    knownQuery.include.script_expr_txt = true;
    req.ensureJoin(q, 'expr as script_expr', 'script_expr.id', 'langvar.script_expr')
    req.selectCol(q, LANGVAR_COLS_MAP, 'script_expr_txt');
  }

  if (include.region_expr_langvar) {
    knownQuery.include.region_expr_langvar = true;
    req.ensureJoin(q, 'expr as region_expr', 'region_expr.id', 'langvar.region_expr');
    req.selectCol(q, LANGVAR_COLS_MAP, 'region_expr_langvar');
  }

  if (include.region_expr_uid) {
    knownQuery.include.region_expr_uid = true;
    req.ensureJoin(q, 'expr as region_expr', 'region_expr.id', 'langvar.region_expr');
    q.join('langvar as region_expr_langvar', 'region_expr_langvar.id', 'region_expr.langvar');
    req.selectCol(q, LANGVAR_COLS_MAP, 'region_expr_uid');
  }

  if (include.region_expr_txt) {
    knownQuery.include.region_expr_txt = true;
    req.ensureJoin(q, 'expr as region_expr', 'region_expr.id', 'langvar.region_expr');
    req.selectCol(q, LANGVAR_COLS_MAP, 'region_expr_txt');
  }

  return q;
}

function conditions(req, q, counting) {
  const knownQuery = req.get('knownQuery');

  if ('id' in req.query) {
    knownQuery.id = true;
    q.where('langvar.id', array.id(req.query.id, 'id'));
  }

  if ('uid' in req.query) {
    knownQuery.uid = true;
    q.where(knex.raw('uid(langvar.lang_code,langvar.var_code)'), array.uid(req.query.uid, 'uid'));
  }

  if ('lang_code' in req.query) {
    knownQuery.lang_code = true;
    q.where('langvar.lang_code', array.langCode(req.query.lang_code));
  }

  if ('grp' in req.query) {
    knownQuery.grp = true;
    q.where('langvar.grp', array.id(req.query.grp, 'grp'));
  }

  if ('name_expr' in req.query) {
    knownQuery.name_expr = true;
    q.where('langvar.name_expr', array.id(req.query.name_expr, 'name_expr'));
  }

  if ('name_expr_txt' in req.query) {
    knownQuery.name_expr_txt = true;
    q.where('expr.txt', array.txtNFC(req.query.name_expr_txt, 'name_expr_txt'));
  }

  if ('name_expr_txt_degr' in req.query) {
    knownQuery.name_expr_txt_degr = true;
    q.where('expr.txt_degr', ...array.txtDegr(req.query.name_expr_txt_degr, 'name_expr_txt_degr'));
  }

  if ('expr_txt' in req.query) {
    knownQuery.expr_txt = true;

    q.whereExists(function () {
      this
        .select(knex.raw(1))
        .from('expr as expr2')
        .where('expr2.langvar', knex.raw('langvar.id'))
        .where('expr2.txt', array.txtNFC(req.query.expr_txt, 'expr_txt'));
    });
  }

  if ('expr_txt_degr' in req.query) {
    knownQuery.expr_txt_degr = true;

    q.whereExists(function () {
      this
        .select(knex.raw(1))
        .from('expr as expr3')
        .where('expr3.langvar', knex.raw('langvar.id'))
        .where('expr3.txt_degr', ...array.txtDegr(req.query.expr_txt_degr, 'expr_txt_degr'));
    });
  }

  if ('trans_expr' in req.query) {
    knownQuery.trans_expr = true;

    q.whereExists(function () {
      this
        .select(knex.raw(1))
        .from('denotationx as denotation2')
        .join('denotationx as denotation', function () {
          this.on('denotation.meaning', 'denotation2.meaning')
            .andOn('denotation2.expr', '!=', 'denotation.expr')
        })
        .where('denotation2.langvar', knex.raw('langvar.id'))
        .where('denotation.expr', array.id(req.query.trans_expr, 'trans_expr'));
    })
  }

  if ('mutable' in req.query) {
    knownQuery.mutable = true;
    req.query.mutable = validate.bool(req.query.mutable, 'mutable');
    q.where('langvar.mutable', req.query.mutable);
  }

  if ('script_expr' in req.query) {
    knownQuery.script_expr = true;
    q.where('langvar.script_expr', array.id(req.query.script_expr, 'script_expr'));
  }

  if ('script_expr_txt' in req.query) {
    knownQuery.script_expr_txt = true;
    req.ensureJoin(q, 'expr as script_expr', 'script_expr.id', 'langvar.script_expr')
    q.where('script_expr.txt', array.txt(req.query.script_expr_txt, 'script_expr_txt'));
  }

  if ('meaning' in req.query) {
    knownQuery.meaning = true;
    q.where('langvar.meaning', array.id(req.query.meaning, 'meaning'));
  }

  if ('region_expr' in req.query) {
    knownQuery.region_expr = true;
    q.where('langvar.region_expr', array.id(req.query.region_expr, 'region_expr'));
  }

  if ('region_expr_langvar' in req.query) {
    knownQuery.region_expr_langvar = true;
    req.ensureJoin(q, 'expr as region_expr', 'region_expr.id', 'langvar.region_expr');
    q.where('region_expr.langvar', array.id(req.query.region_expr_langvar, 'region_expr_langvar'));
  }

  if ('region_expr_uid' in req.query) {
    knownQuery.region_expr_uid = true;
    req.ensureJoin(q, 'expr as region_expr', 'region_expr.id', 'langvar.region_expr');
    q.where('region_expr.langvar', ...array.uidLangvar(req.query.region_expr_uid, 'region_expr_uid'));
  }

  if ('region_expr_txt' in req.query) {
    knownQuery.region_expr_txt = true;
    req.ensureJoin(q, 'expr as region_expr', 'region_expr.id', 'langvar.region_expr');
    q.where('region_expr.txt', array.txt(req.query.region_expr_txt, 'region_expr_txt'));
  }

}

function loadLangvar(req, res, next, langvar) {
  const q = query(req);

  let captures;
  if (langvar.match(/^\d+$/)) {
    q.where('langvar.id', langvar);
  } else if (captures = /^([a-z]{3})-([0-9]{3})$/.exec(langvar)) {
    q.where({'langvar.lang_code': captures[1], 'langvar.var_code': Number(captures[2])});
  }
  else return next(new errors.InvalidArgumentError('invalid language variety format: must be integer id or uniform identifier (aaa-000)'));

  q.first().then(function(row) {
    if (!row) return next(new errors.ResourceNotFoundError(`language variety ${langvar} was not found`));

    transformRow(row, req.get('include'));
    req.get('obj').langvar = row;
    next();
  }).catch(err => {
    next(new errors.InternalError(err.message || err));
  });
}

function langvar(req, res, next) {
  const q = query(req);
  conditions(req, q);

  req.applyGlobalParams(q, LANGVAR_COLS_MAP, 'id', 'langvar', null, true);

  const include = req.get('include');
  if (include.denotation_count || include.expr_count) {
    req.set('transform', row => {
      transformRow(row, include);
    });
  }

  const obj = req.get('obj');
  obj.resultType = 'langvar';
  next();
}

function transformRow(row, include) {
  if (include.denotation_count) row.denotation_count = Number(row.denotation_count);
  if (include.expr_count) row.expr_count = Number(row.expr_count);
}

module.exports = {
  init: init,
  conditions: conditions,
  query: query
};
