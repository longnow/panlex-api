const array = require('../../lib/array');
const knex = require('../../lib/db');
const lateral = require('../../lib/lateral');
const validate = require('../../lib/validate');
const finalizeColMap = require('../../lib/col_map');

const errors = require('restify-errors');
const _ = require('lodash');

const SOURCE_COLS = ['au','ui','ap','ip','co','ad','bn','tt','li','ul','pb','uq','dt','ti','ur','yr'];

const SOURCE_COLS_MAP = finalizeColMap({
  dncount_est: 'aped.dncount',
  fp: 'aped.fp',
}, SOURCE_COLS, 'ap');

const ARRAY_PARAMS = ['ap','ex','fm','ui','tt','lv','trex','uid','us'];

function init(app) {
  app.apiParam('ap', loadSource);

  app.apiRoute({ path: '/ap', arrayParams: ARRAY_PARAMS, executeQuery: true }, source);
  app.apiRoute({ path: '/ap/count', arrayParams: ARRAY_PARAMS }, require('./count')('ap'));
  app.apiRoute({ path: '/ap/:ap' });
}

function query(req) {
  const q = knex('ap');
  req.selectCols(q, SOURCE_COLS_MAP, SOURCE_COLS);

  const knownQuery = req.get('knownQuery');
  const include = req.get('include');

  if (include.fp) {
    knownQuery.include.fp = true;
    req.ensureJoin(q, 'aped', 'aped.ap', 'ap.ap');
    req.selectCol(q, SOURCE_COLS_MAP, 'fp');
  }

  if (include.dncount_est) {
    knownQuery.include.dncount_est = true;
    req.ensureJoin(q, 'aped', 'aped.ap', 'ap.ap');
    req.selectCol(q, SOURCE_COLS_MAP, 'dncount_est');
  }

  if (include.fm) {
    knownQuery.include.fm = true;

    const subq = knex
      .select(knex.raw('array_agg(fm.tt ORDER BY fm.tt) as val'))
      .from('af')
      .join('fm', 'fm.fm', 'af.fm')
      .where('af.ap', knex.raw('ap.ap'));

    lateral.leftJoin(q, subq, 'fm');
    q.select(knex.raw("coalesce(fm.val, '{}') as fm"));
  }

  if (include.lv) {
    knownQuery.include.lv = true;

    const subq = knex
      .select(knex.raw('array_agg(av.lv ORDER BY av.lv) as val'))
      .from('av')
      .where('av.ap', knex.raw('ap.ap'));

    lateral.leftJoin(q, subq, 'lv');
    q.select(knex.raw("coalesce(lv.val, '{}') as lv"));
  }

  if (include.lv_attested) {
    knownQuery.include.lv_attested = true;

    const subq = knex
      .select(knex.raw('array_agg(DISTINCT dnx.lv ORDER BY dnx.lv) as val'))
      .from('dnx')
      .where('dnx.ap', knex.raw('ap.ap'));

    lateral.leftJoin(q, subq, 'lv_attested');
    q.select(knex.raw("coalesce(lv_attested.val, '{}') as lv_attested"));
  }

  if (include.dncount) {
    knownQuery.include.dncount = true;
    q.select(function () {
      this.count().from('dnx').where('ap.ap', knex.raw('dnx.ap')).as('dncount');
    });
  }

  if (include.mncount) {
    knownQuery.include.mncount = true;
    q.select(function () {
      this.count().from('mn').where('ap.ap', knex.raw('mn.ap')).as('mncount');
    });
  }

  if (include.us) {
    knownQuery.include.us = true;

    const subq = knex
      .select(knex.raw('array_agg(us.al ORDER BY us.al) as val'))
      .from('au')
      .join('us', 'us.us', 'au.us')
      .where('au.ap', knex.raw('ap.ap'));

    lateral.leftJoin(q, subq, 'us');
    q.select(knex.raw("coalesce(us.val, '{}') as us"));
  }

  return q;
}

function conditions(req, q, counting) {
  const knownQuery = req.get('knownQuery');

  if ('ap' in req.query) {
    knownQuery.ap = true;
    q.where('ap.ap', array.id(req.query.ap, 'ap'));
  }

  if ('ui' in req.query) {
    knownQuery.ui = true;
    q.where('ap.ui', array.id(req.query.ui, 'ui'));
  }

  if ('tt' in req.query) {
    knownQuery.tt = true;
    q.where('ap.tt', array.txtNFC(req.query.tt, 'tt'));
  }

  if ('lv' in req.query) {
    knownQuery.lv = true;

    q.whereExists(function () {
      this
        .select(knex.raw(1))
        .from('av as av2')
        .where('av2.ap', knex.raw('ap.ap'))
        .where('av2.lv', array.id(req.query.lv, 'lv'));
    });
  }

  if ('uid' in req.query) {
    knownQuery.uid = true;

    q.whereExists(function () {
      this
        .select(knex.raw(1))
        .from('av as av3')
        .where('av3.ap', knex.raw('ap.ap'))
        .where('av3.lv', ...array.uidLangvar(req.query.uid, 'uid'));
    });
  }

  if ('ex' in req.query) {
    knownQuery.ex = true;

    const expr = _.uniq(req.query.ex);
    q.whereExists(function () {
      this
        .select(knex.raw(1))
        .from('dnx as dn')
        .where('dn.ap', knex.raw('ap.ap'))
        .where('dn.ex', array.id(expr, 'ex'))
        .having(knex.raw('count(DISTINCT dn.ex)'), '>=', expr.length);
    });
  }

  if ('trex' in req.query) {
    knownQuery.trex = true;

    const trans_expr = _.uniq(req.query.trex);
    q.whereExists(function () {
      this
        .select(knex.raw(1))
        .from('dnx as dn2')
        .where('dn2.ap', knex.raw('ap.ap'))
        .where('dn2.ex', array.id(trans_expr, 'trex'))
        .groupBy('dn2.mn')
        .having(knex.raw('count(*)'), '>=', trans_expr.length);
    });
  }

  if ('mn' in req.query) {
    knownQuery.mn = true;
    req.query.mn = validate.bool(req.query.mn, 'mn');

    const method = req.query.mn ? 'whereExists' : 'whereNotExists';

    q[method](function () {
      this.select(knex.raw(1)).from('mn').where('mn.ap', knex.raw('ap.ap'));
    });
  }

  if ('us' in req.query) {
    knownQuery.us = true;

    q.whereExists(function () {
      this
        .select(knex.raw(1))
        .from('au as au2')
        .join('us as us2', 'us2.us', 'au2.us')
        .where('au2.ap', knex.raw('ap.ap'))
        .where('us2.al', array.txt(req.query.us, 'us'));
    });
  }

  if ('fm' in req.query) {
    knownQuery.fm = true;

    q.whereExists(function () {
      this
        .select(knex.raw(1))
        .from('af as af2')
        .join('fm as fm2', 'fm2.fm', 'af2.fm')
        .where('af2.ap', knex.raw('ap.ap'))
        .where('fm2.tt', array.txt(req.query.fm, 'fm'));
    });
  }

}

function loadSource(req, res, next, source) {
  const q = query(req);
  const col = source.match(/^\d+$/) ? 'ap.ap' : 'ap.tt';
  q.where(col, source);

  q.first().then(row => {
    if (!row) next(new errors.ResourceNotFoundError(`source ${source} was not found`));
    else {
      transformRow(row);
      req.get('obj').ap = row;
      next();
    }
  }).catch(err => {
    next(new errors.InternalError(err.message || err));
  });
}

function source(req, res, next) {
  const q = query(req);
  conditions(req, q);

  req.applyGlobalParams(q, SOURCE_COLS_MAP, 'ap', 'source', null, true);
  req.set('transform', transformRow);

  const obj = req.get('obj');
  obj.resultType = 'ap';
  next();
}

const liMap = {
  cc: 'Creative Commons',
  co: 'copyright',
  gd: 'GNU Free Documentation License',
  gl: 'GNU Lesser General Public License',
  gp: 'GNU General Public License',
  mi: 'MIT License',
  na: 'unknown',
  nr: 'public domain',
  pl: 'PanLex Use Permission',
  rp: 'request',
  zz: 'other'
};

function transformRow(row) {
  if ('li' in row) row.li = liMap[row.li];
  if ('dncount' in row) row.dncount = Number(row.dncount);
  if ('mncount' in row) row.mncount = Number(row.mncount);
}

module.exports = {
  init: init,
  conditions: conditions,
  query: query
};
