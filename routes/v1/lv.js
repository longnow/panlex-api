const array = require('../../lib/array');
const knex = require('../../lib/db');
const lateral = require('../../lib/lateral');
const validate = require('../../lib/validate');
const finalizeColMap = require('../../lib/col_map');

const errors = require('restify-errors');

const LANGVAR_COLS = ['gp','lv','lc','mn','mu','ex','tt','td','rg','sc','uid','vc'];

const LANGVAR_COLS_MAP = finalizeColMap({
  tt:      'ex.tt',
  td: 'ex.td',
  region_expr_langvar:'region_expr.lv',
  region_expr_uid:    'uid(region_expr_langvar.lc,region_expr_langvar.vc)',
  region_expr_txt:    'region_expr.tt',
  sctt:    'scex.tt',
  uid:                'uid(lv.lc,lv.vc)',
}, LANGVAR_COLS, 'lv');

const ARRAY_PARAMS = ['extt','extd','gp','lv','lc','mn','ex','tt','td','rg','region_expr_langvar','region_expr_uid','region_expr_txt','sc','sctt','trex','uid'];

const SCRIPT_LV = 6845; // art-262 = ISO 15924

function init(app) {
  app.apiParam('lv', loadLangvar);

  app.apiRoute({ path: '/lv', arrayParams: ARRAY_PARAMS, executeQuery: true }, langvar);
  app.apiRoute({ path: '/lv/count', arrayParams: ARRAY_PARAMS }, require('./count')('lv'));
  app.apiRoute({ path: '/lv/:lv' });
}

function query(req) {
  const q = knex('lv').join('ex', 'ex.ex', 'lv.ex');
  req.selectCols(q, LANGVAR_COLS_MAP, LANGVAR_COLS);

  const knownQuery = req.get('knownQuery');
  const include = req.get('include');

  if (include.cp) {
    knownQuery.include.cp = true;

    const subq = knex
      .select(knex.raw('array_agg(json_build_array(hex_to_integer(cp.c0), hex_to_integer(cp.c1)) ORDER BY hex_to_integer(cp.c0), hex_to_integer(cp.c1)) as val'))
      .from('cp')
      .where('cp.lv', knex.raw('lv.lv'));

    lateral.leftJoin(q, subq, 'cp');
    q.select(knex.raw("coalesce(cp.val, '{}') as cp"));
  }

  if (include.cu) {
    knownQuery.include.cu = true;

    const subq = knex
      .select(knex.raw("array_agg(json_build_object('range',json_build_array(hex_to_integer(cu.c0), hex_to_integer(cu.c1)),'loc',cu.loc,'category',cu.vb) ORDER BY hex_to_integer(cu.c0), hex_to_integer(cu.c1)) as val"))
      .from('cu')
      .where('cu.lv', knex.raw('lv.lv'));

    lateral.leftJoin(q, subq, 'cu');
    q.select(knex.raw("coalesce(cu.val, '{}') as cu"));
  }

  if (include.dncount) {
    knownQuery.include.dncount = true;
    q.select(function () {
      this.count().from('dnx').where('dnx.lv', knex.raw('lv.lv')).as('dncount');
    });
  }

  if (include.excount) {
    knownQuery.include.excount = true;
    q.select(function () {
      this.count().from('ex').where('ex.lv', knex.raw('lv.lv')).as('excount');
    });
  }

  if (include.sctt) {
    knownQuery.include.sctt = true;
    req.ensureJoin(q, 'ex as scex', 'scex.ex', 'lv.sc')
    req.selectCol(q, LANGVAR_COLS_MAP, 'sctt');
  }

  if (include.region_expr_langvar) {
    knownQuery.include.region_expr_langvar = true;
    req.ensureJoin(q, 'ex as rg', 'region_expr.lv', 'lv.rg');
    req.selectCol(q, LANGVAR_COLS_MAP, 'region_expr_langvar');
  }

  if (include.region_expr_uid) {
    knownQuery.include.region_expr_uid = true;
    req.ensureJoin(q, 'ex as rg', 'region_expr.lv', 'lv.rg');
    q.join('lv as region_expr_langvar', 'region_expr_langvar.lv', 'region_expr.lv');
    req.selectCol(q, LANGVAR_COLS_MAP, 'region_expr_uid');
  }

  if (include.region_expr_txt) {
    knownQuery.include.region_expr_txt = true;
    req.ensureJoin(q, 'ex as rg', 'region_expr.lv', 'lv.rg');
    req.selectCol(q, LANGVAR_COLS_MAP, 'region_expr_txt');
  }

  return q;
}

function conditions(req, q, counting) {
  const knownQuery = req.get('knownQuery');

  if ('lv' in req.query) {
    knownQuery.lv = true;
    q.where('lv.lv', array.id(req.query.lv, 'lv'));
  }

  if ('uid' in req.query) {
    knownQuery.uid = true;
    q.where(knex.raw('uid(lv.lc,lv.vc)'), array.uid(req.query.uid, 'uid'));
  }

  if ('lc' in req.query) {
    knownQuery.lc = true;
    q.where('lv.lc', array.langCode(req.query.lc));
  }

  if ('gp' in req.query) {
    knownQuery.gp = true;
    q.where('lv.gp', array.id(req.query.gp, 'gp'));
  }

  if ('ex' in req.query) {
    knownQuery.ex = true;
    q.where('lv.ex', array.id(req.query.ex, 'ex'));
  }

  if ('tt' in req.query) {
    knownQuery.tt = true;
    q.where('ex.tt', array.txtNFC(req.query.tt, 'tt'));
  }

  if ('td' in req.query) {
    knownQuery.td = true;
    q.where('ex.td', ...array.txtDegr(req.query.td, 'td'));
  }

  if ('extt' in req.query) {
    knownQuery.extt = true;

    q.whereExists(function () {
      this
        .select(knex.raw(1))
        .from('ex as ex2')
        .where('ex2.lv', knex.raw('lv.lv'))
        .where('ex2.tt', array.txtNFC(req.query.extt, 'extt'));
    });
  }

  if ('extd' in req.query) {
    knownQuery.extd = true;

    q.whereExists(function () {
      this
        .select(knex.raw(1))
        .from('ex as ex3')
        .where('ex3.lv', knex.raw('lv.lv'))
        .where('ex3.td', ...array.txtDegr(req.query.extd, 'extd'));
    });
  }

  if ('trex' in req.query) {
    knownQuery.trex = true;

    q.whereExists(function () {
      this
        .select(knex.raw(1))
        .from('dnx as dn2')
        .join('dnx as dn', function () {
          this.on('dn.mn', 'dn2.mn')
            .andOn('dn2.ex', '!=', 'dn.ex')
        })
        .where('dn2.lv', knex.raw('lv.lv'))
        .where('dn.ex', array.id(req.query.trex, 'trex'));
    })
  }

  if ('mu' in req.query) {
    knownQuery.mu = true;
    req.query.mu = validate.bool(req.query.mu, 'mu');
    q.where('lv.mu', req.query.mu);
  }

  if ('sc' in req.query) {
    knownQuery.sc = true;
    q.where('lv.sc', array.id(req.query.sc, 'sc'));
  }

  if ('sctt' in req.query) {
    knownQuery.sctt = true;
    req.ensureJoin(q, 'ex as scex', 'scex.ex', 'lv.sc')
    q.where('scex.tt', array.txt(req.query.sctt, 'sctt'));
  }

  if ('mn' in req.query) {
    knownQuery.mn = true;
    q.where('lv.mn', array.id(req.query.mn, 'mn'));
  }

  if ('rg' in req.query) {
    knownQuery.rg = true;
    q.where('lv.rg', array.id(req.query.rg, 'rg'));
  }

  if ('region_expr_langvar' in req.query) {
    knownQuery.region_expr_langvar = true;
    req.ensureJoin(q, 'ex as rg', 'region_expr.lv', 'lv.rg');
    q.where('region_expr.lv', array.id(req.query.region_expr_langvar, 'region_expr_langvar'));
  }

  if ('region_expr_uid' in req.query) {
    knownQuery.region_expr_uid = true;
    req.ensureJoin(q, 'ex as rg', 'region_expr.lv', 'lv.rg');
    q.where('region_expr.lv', ...array.uidLangvar(req.query.region_expr_uid, 'region_expr_uid'));
  }

  if ('region_expr_txt' in req.query) {
    knownQuery.region_expr_txt = true;
    req.ensureJoin(q, 'ex as rg', 'region_expr.lv', 'lv.rg');
    q.where('region_expr.tt', array.txt(req.query.region_expr_txt, 'region_expr_txt'));
  }

}

function loadLangvar(req, res, next, langvar) {
  const q = query(req);

  let captures;
  if (langvar.match(/^\d+$/)) {
    q.where('lv.lv', langvar);
  } else if (captures = /^([a-z]{3})-([0-9]{3})$/.exec(langvar)) {
    q.where({'lv.lc': captures[1], 'lv.vc': Number(captures[2])});
  }
  else return next(new errors.InvalidArgumentError('invalid language variety format: must be integer id or uniform identifier (aaa-000)'));

  q.first().then(function(row) {
    if (!row) return next(new errors.ResourceNotFoundError(`language variety ${langvar} was not found`));

    transformRow(row, req.get('include'));
    req.get('obj').lv = row;
    next();
  }).catch(err => {
    next(new errors.InternalError(err.message || err));
  });
}

function langvar(req, res, next) {
  const q = query(req);
  conditions(req, q);

  req.applyGlobalParams(q, LANGVAR_COLS_MAP, 'lv', 'langvar', null, true);

  const include = req.get('include');
  if (include.dncount || include.excount) {
    req.set('transform', row => {
      transformRow(row, include);
    });
  }

  const obj = req.get('obj');
  obj.resultType = 'lv';
  next();
}

function transformRow(row, include) {
  if (include.dncount) row.dncount = Number(row.dncount);
  if (include.excount) row.excount = Number(row.excount);
}

module.exports = {
  init: init,
  conditions: conditions,
  query: query
};
