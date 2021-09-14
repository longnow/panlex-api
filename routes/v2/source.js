const array = require('../../lib/array');
const knex = require('../../lib/db');
const lateral = require('../../lib/lateral');
const validate = require('../../lib/validate');
const finalizeColMap = require('../../lib/col_map');

const errors = require('restify-errors');
const _ = require('lodash');

const SOURCE_COLS = ['author','grp','id','ip_claim','ip_claimant','ip_claimant_email','isbn','label','license','note','publisher','quality','reg_date','title','url','year'];

const SOURCE_COLS_MAP = finalizeColMap({
  denotation_count_estimate: 'source_editorial.denotation_count',
  directory: 'source_editorial.directory',
}, SOURCE_COLS, 'source');

const ARRAY_PARAMS = ['id','expr','format','grp','label','langvar','trans_expr','uid','usr'];

function init(app) {
  app.apiParam('source', loadSource);

  app.apiRoute({ path: '/v2/source', arrayParams: ARRAY_PARAMS, executeQuery: true }, source);
  app.apiRoute({ path: '/v2/source/count', arrayParams: ARRAY_PARAMS }, require('./count')('source'));
  app.apiRoute({ path: '/v2/source/:source' });
}

function query(req) {
  const q = knex('source');
  req.selectCols(q, SOURCE_COLS_MAP, SOURCE_COLS);

  const knownQuery = req.get('knownQuery');
  const include = req.get('include');

  if (include.directory) {
    knownQuery.include.directory = true;
    req.ensureJoin(q, 'source_editorial', 'source_editorial.source', 'source.id');
    req.selectCol(q, SOURCE_COLS_MAP, 'directory');
  }

  if (include.denotation_count_estimate) {
    knownQuery.include.denotation_count_estimate = true;
    req.ensureJoin(q, 'source_editorial', 'source_editorial.source', 'source.id');
    req.selectCol(q, SOURCE_COLS_MAP, 'denotation_count_estimate');
  }

  if (include.format) {
    knownQuery.include.format = true;

    const subq = knex
      .select(knex.raw('array_agg(format.label ORDER BY format.label) as val'))
      .from('source_format')
      .join('format', 'format.id', 'source_format.format')
      .where('source_format.source', knex.raw('source.id'));

    lateral.leftJoin(q, subq, 'format');
    q.select(knex.raw("coalesce(format.val, '{}') as format"));
  }

  if (include.langvar) {
    knownQuery.include.langvar = true;

    const subq = knex
      .select(knex.raw('array_agg(source_langvar.langvar ORDER BY source_langvar.langvar) as val'))
      .from('source_langvar')
      .where('source_langvar.source', knex.raw('source.id'));

    lateral.leftJoin(q, subq, 'langvar');
    q.select(knex.raw("coalesce(langvar.val, '{}') as langvar"));
  }

  if (include.langvar_attested) {
    knownQuery.include.langvar_attested = true;

    const subq = knex
      .select(knex.raw('array_agg(DISTINCT denotationx.langvar ORDER BY denotationx.langvar) as val'))
      .from('denotationx')
      .where('denotationx.source', knex.raw('source.id'));

    lateral.leftJoin(q, subq, 'langvar_attested');
    q.select(knex.raw("coalesce(langvar_attested.val, '{}') as langvar_attested"));
  }

  if (include.denotation_count) {
    knownQuery.include.denotation_count = true;
    q.select(function () {
      this.count().from('denotationx').where('source.id', knex.raw('denotationx.source')).as('denotation_count');
    });
  }

  if (include.meaning_count) {
    knownQuery.include.meaning_count = true;
    q.select(function () {
      this.count().from('meaning').where('source.id', knex.raw('meaning.source')).as('meaning_count');
    });
  }

  if (include.usr) {
    knownQuery.include.usr = true;

    const subq = knex
      .select(knex.raw('array_agg(usr.username ORDER BY usr.username) as val'))
      .from('source_meaning_editor')
      .join('usr', 'usr.id', 'source_meaning_editor.usr')
      .where('source_meaning_editor.source', knex.raw('source.id'));

    lateral.leftJoin(q, subq, 'usr');
    q.select(knex.raw("coalesce(usr.val, '{}') as usr"));
  }

  return q;
}

function conditions(req, q, counting) {
  const knownQuery = req.get('knownQuery');

  if ('id' in req.query) {
    knownQuery.id = true;
    q.where('source.id', array.id(req.query.id, 'id'));
  }

  if ('grp' in req.query) {
    knownQuery.grp = true;
    q.where('source.grp', array.id(req.query.grp, 'grp'));
  }

  if ('label' in req.query) {
    knownQuery.label = true;
    q.where('source.label', array.txtNFC(req.query.label, 'label'));
  }

  if ('langvar' in req.query) {
    knownQuery.langvar = true;

    q.whereExists(function () {
      this
        .select(knex.raw(1))
        .from('source_langvar as source_langvar2')
        .where('source_langvar2.source', knex.raw('source.id'))
        .where('source_langvar2.langvar', array.id(req.query.langvar, 'langvar'));
    });
  }

  if ('uid' in req.query) {
    knownQuery.uid = true;

    q.whereExists(function () {
      this
        .select(knex.raw(1))
        .from('source_langvar as source_langvar3')
        .where('source_langvar3.source', knex.raw('source.id'))
        .where('source_langvar3.langvar', ...array.uidLangvar(req.query.uid, 'uid'));
    });
  }

  if ('expr' in req.query) {
    knownQuery.expr = true;

    const expr = _.uniq(req.query.expr);
    q.whereExists(function () {
      this
        .select(knex.raw(1))
        .from('denotationx as denotation')
        .where('denotation.source', knex.raw('source.id'))
        .where('denotation.expr', array.id(expr, 'expr'))
        .having(knex.raw('count(DISTINCT denotation.expr)'), '>=', expr.length);
    });
  }

  if ('trans_expr' in req.query) {
    knownQuery.trans_expr = true;

    const trans_expr = _.uniq(req.query.trans_expr);
    q.whereExists(function () {
      this
        .select(knex.raw(1))
        .from('denotationx as denotation2')
        .where('denotation2.source', knex.raw('source.id'))
        .where('denotation2.expr', array.id(trans_expr, 'trans_expr'))
        .groupBy('denotation2.meaning')
        .having(knex.raw('count(*)'), '>=', trans_expr.length);
    });
  }

  if ('meaning' in req.query) {
    knownQuery.meaning = true;
    req.query.meaning = validate.bool(req.query.meaning, 'meaning');

    const method = req.query.meaning ? 'whereExists' : 'whereNotExists';

    q[method](function () {
      this.select(knex.raw(1)).from('meaning').where('meaning.source', knex.raw('source.id'));
    });
  }

  if ('usr' in req.query) {
    knownQuery.usr = true;

    q.whereExists(function () {
      this
        .select(knex.raw(1))
        .from('source_meaning_editor as source_meaning_editor2')
        .join('usr as usr2', 'usr2.id', 'source_meaning_editor2.usr')
        .where('source_meaning_editor2.source', knex.raw('source.id'))
        .where('usr2.username', array.txt(req.query.usr, 'usr'));
    });
  }

  if ('format' in req.query) {
    knownQuery.format = true;

    q.whereExists(function () {
      this
        .select(knex.raw(1))
        .from('source_format as source_format2')
        .join('format as format2', 'format2.id', 'source_format2.format')
        .where('source_format2.source', knex.raw('source.id'))
        .where('format2.label', array.txt(req.query.format, 'format'));
    });
  }

}

function loadSource(req, res, next, source) {
  const q = query(req);
  const col = source.match(/^\d+$/) ? 'source.id' : 'source.label';
  q.where(col, source);

  q.first().then(row => {
    if (!row) next(new errors.ResourceNotFoundError(`source ${source} was not found`));
    else {
      transformRow(row);
      req.get('obj').source = row;
      next();
    }
  }).catch(err => {
    next(new errors.InternalError(err.message || err));
  });
}

function source(req, res, next) {
  const q = query(req);
  conditions(req, q);

  req.applyGlobalParams(q, SOURCE_COLS_MAP, 'id', 'source', null, true);
  req.set('transform', transformRow);

  const obj = req.get('obj');
  obj.resultType = 'source';
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
  if ('license' in row) row.license = liMap[row.license];
  if ('denotation_count' in row) row.denotation_count = Number(row.denotation_count);
  if ('meaning_count' in row) row.meaning_count = Number(row.meaning_count);
}

module.exports = {
  init: init,
  conditions: conditions,
  query: query
};
