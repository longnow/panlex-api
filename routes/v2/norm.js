const array = require('../../lib/array');
const copyIntoTable = require('../../lib/copy_into_table');
const knex = require('../../lib/db');
const pgEscape = require('../../lib/pg_escape');
const validate = require('../../lib/validate');

const errors = require('restify-errors');
const _ = require('lodash');

const ARRAY_PARAMS = ['grp','txt'];

function init(app) {
  app.apiRoute({ path: '/v2/norm/expr/:langvar', arrayParams: ARRAY_PARAMS }, norm('expr', joinSourceExpr, createTempExpr));
  app.apiRoute({ path: '/v2/norm/definition/:langvar', arrayParams: ARRAY_PARAMS }, norm('definition', joinSourceDefinition, createTempDefinition));
}

function norm(table, joinSource, createTemp) {
  return function(req, res, next) {
    if (!('txt' in req.query))
      return next(new errors.MissingParameterError('the parameter "txt" is required'));

    const knownQuery = req.get('knownQuery');

    knownQuery.txt = true;
    let txt = req.query.txt;
    validate.array(txt, 'txt');
    txt = _.uniq(txt);

    knownQuery.grp = true;
    let grp = req.query.grp;
    if (grp === undefined) grp = [];
    validate.array(grp, 'grp', false, true);

    const result = {};
    const obj = req.get('obj');

    let txtDegrFunc = 'txt_degr';
    let txtDegrCode;

    knownQuery.degrade = true;
    if (req.query.degrade) {
      knownQuery.code = knownQuery.regex = true;

      if (req.query.code) {
        if (req.query.code.match(/\$BODY\$|spi_(?:exec_query|query|fetchrow|cursor_close|prepare|query_prepared|exec_prepared|freeplan)/)) {
          return next(new errors.InvalidArgumentError('the parameter "code" contains a prohibited string'));
        }

        txtDegrCode = req.query.code;
      }
      else if (req.query.regex) {
        validate.array(req.query.regex, 'regex');
        if (req.query.regex.length !== 2) {
          return next(new errors.InvalidArgumentError('the parameter "regex" must be an array with two elements'));
        }
        req.query.regex.forEach(item => { validate.string(item, 'regex', true, true) });

        txtDegrCode = 'return $_[0] =~ s/' + req.query.regex[0].replace(/\//g, '\\/') + '/'
          + req.query.regex[1].replace(/\//g, '\\/') + '/gr';
      }
    }

    knex.transaction(trx => {
      if (req.query.degrade) {
        if (txtDegrCode) return setupCustomTxtDegr(trx, degrade);
        else return degrade(trx);
      }
      else return exact(trx);
    }).then(() => {
      obj.norm = result;
      next();
    }).catch(err => {
      next(new errors.InternalError(err.message || err));
    });

    function exact(trx) {
      return trx.raw('CREATE TEMP TABLE tmp_norm (txt_orig text, txt text) ON COMMIT DROP')
      .then(() => {
        return copyIntoTable(trx, 'tmp_norm', txt.map(item => {
          item = pgEscape(item);
          return [item, item.normalize('NFC')].join('\t') + '\n';
        }));
      }).then(rows => {
        return initializeQuery(trx, 'txt');
      }).then(rows => {
        rows.forEach(row => {
          result[row.txt_orig] = { score: row.score };
        });

        txt.forEach(item => {
          if (!(item in result)) result[item] = { score: 0 };
        });
      });
    }

    function setupCustomTxtDegr(trx, cb) {
      txtDegrFunc = 'pg_temp.txt_degr';

      return trx.raw(`CREATE FUNCTION pg_temp.txt_degr(txt text) RETURNS text AS $BODY$${txtDegrCode}$BODY$ LANGUAGE plperl IMMUTABLE`)
      .catch(err => {
        next(new errors.InvalidArgumentError(`could not create custom txt_degr function: ${err}`));
      }).then(() => {
        return createTemp(trx, obj.langvar.id, cb);
      });
    }

    function degrade(trx) {
      txt.forEach(item => {
        result[item] = [];
      });

      return trx.raw('CREATE TEMP TABLE tmp_norm (txt_orig text, txt text, txt_degr text) ON COMMIT DROP')
      .then(() => {
        return copyIntoTable(trx, 'tmp_norm', txt.map(item => {
          item = pgEscape(item);
          return [item, item.normalize('NFC')].join('\t') + '\t\n';
        }));
      }).then(() => {
        return trx('tmp_norm').update('txt_degr', knex.raw(`${txtDegrFunc}(txt)`));
      }).then(function() {
        return initializeQuery(trx, 'txt_degr')
          .select(`${table}.txt`)
          .groupBy(`${table}.txt`, `${table}.txt_degr`)
          .orderByRaw('2 desc')
          .orderBy(`${table}.txt`);
      }).then(rows => {
        rows.forEach(row => {
          result[row.txt_orig].push({ score: row.score, txt: row.txt });
        });

        txt.forEach(item => {
          if (result[item].length === 0) result[item].push({ score: 0, txt: null });
        });

        if (txtDegrCode) return trx.raw('DROP FUNCTION pg_temp.txt_degr(text)');
      });
    }

    function initializeQuery(trx, col) {
      const q = trx
        .select('tmp_norm.txt_orig')
        .from('tmp_norm')
        .join(table, `${table}.${col}`, `tmp_norm.${col}`);

      if (!txtDegrCode) q.where(`${table}.langvar`, obj.langvar.id);

      const sourceTable = joinSource(q);

      if (grp.length) {
        q.where(`${sourceTable}.grp`, '!=', array.notId(grp, 'grp'));
      }

      q
        .select(trx.raw(`grp_quality_score(array_agg(${sourceTable}.grp), array_agg(${sourceTable}.quality)) as score`))
        .groupBy('tmp_norm.txt_orig');

      return q;
    }
  }
}

function joinSourceExpr(q) {
  q
    .join('denotationx', 'denotationx.expr', 'expr.id');

  return 'denotationx';
}

function joinSourceDefinition(q) {
  q
    .join('meaning', 'meaning.id', 'definition.meaning')
    .join('source', 'source.id', 'meaning.source');

  return 'source';
}

function createTempExpr(trx, langvar, cb) {
  return trx.raw('CREATE TEMP TABLE expr ON COMMIT DROP AS SELECT id, txt, pg_temp.txt_degr(txt) AS txt_degr FROM expr WHERE langvar = ?', [langvar])
  .then(() => {
    return trx.raw('CREATE INDEX ON pg_temp.expr (txt_degr)');
  }).then(() => {
    return trx.raw('ANALYZE pg_temp.expr');
  }).then(() => {
    return cb(trx);
  });
}

function createTempDefinition(trx, langvar, cb) {
  return trx.raw('CREATE TEMP TABLE definition ON COMMIT DROP AS SELECT meaning, txt, pg_temp.txt_degr(txt) AS txt_degr FROM definition WHERE langvar = ?', [langvar])
  .then(() => {
    return trx.raw('CREATE INDEX ON pg_temp.definition (txt_degr)');
  }).then(() => {
    return trx.raw('ANALYZE pg_temp.definition');
  }).then(() => {
    return cb(trx);
  });
}

module.exports = {
  init: init
};
