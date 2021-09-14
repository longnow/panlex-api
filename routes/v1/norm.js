const array = require('../../lib/array');
const copyIntoTable = require('../../lib/copy_into_table');
const knex = require('../../lib/db');
const pgEscape = require('../../lib/pg_escape');
const validate = require('../../lib/validate');

const errors = require('restify-errors');
const _ = require('lodash');

const ARRAY_PARAMS = ['ui','tt'];

function init(app) {
  app.apiRoute({ path: '/norm/ex/:lv', arrayParams: ARRAY_PARAMS }, norm('ex', joinSourceExpr, createTempExpr));
  app.apiRoute({ path: '/norm/df/:lv', arrayParams: ARRAY_PARAMS }, norm('df', joinSourceDefinition, createTempDefinition));
}

function norm(table, joinSource, createTemp) {
  return function(req, res, next) {
    if (!('tt' in req.query))
      return next(new errors.MissingParameterError('the parameter "tt" is required'));

    const knownQuery = req.get('knownQuery');

    knownQuery.tt = true;
    let txt = req.query.tt;
    validate.array(txt, 'tt');
    txt = _.uniq(txt);

    knownQuery.ui = true;
    let grp = req.query.ui;
    if (grp === undefined) grp = [];
    validate.array(grp, 'ui', false, true);

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
      return trx.raw('CREATE TEMP TABLE tmp_norm (ttorig text, tt text) ON COMMIT DROP')
      .then(() => {
        return copyIntoTable(trx, 'tmp_norm', txt.map(item => {
          item = pgEscape(item);
          return [item, item.normalize('NFC')].join('\t') + '\n';
        }));
      }).then(rows => {
        return initializeQuery(trx, 'tt');
      }).then(rows => {
        rows.forEach(row => {
          result[row.ttorig] = { score: row.score };
        });

        txt.forEach(item => {
          if (!(item in result)) result[item] = { score: 0 };
        });
      });
    }

    function setupCustomTxtDegr(trx, cb) {
      txtDegrFunc = 'pg_temp.txt_degr';

      return trx.raw(`CREATE FUNCTION pg_temp.txt_degr(tt text) RETURNS text AS $BODY$${txtDegrCode}$BODY$ LANGUAGE plperl IMMUTABLE`)
      .catch(err => {
        next(new errors.InvalidArgumentError(`could not create custom txt_degr function: ${err}`));
      }).then(() => {
        return createTemp(trx, obj.lv.lv, cb);
      });
    }

    function degrade(trx) {
      txt.forEach(item => {
        result[item] = [];
      });

      return trx.raw('CREATE TEMP TABLE tmp_norm (ttorig text, tt text, td text) ON COMMIT DROP')
      .then(() => {
        return copyIntoTable(trx, 'tmp_norm', txt.map(item => {
          item = pgEscape(item);
          return [item, item.normalize('NFC')].join('\t') + '\t\n';
        }));
      }).then(() => {
        return trx('tmp_norm').update('td', knex.raw(`${txtDegrFunc}(tt)`));
      }).then(function() {
        return initializeQuery(trx, 'td')
          .select(`${table}.tt`)
          .groupBy(`${table}.tt`, `${table}.td`)
          .orderByRaw('2 desc')
          .orderBy(`${table}.tt`);
      }).then(rows => {
        rows.forEach(row => {
          result[row.ttorig].push({ score: row.score, tt: row.tt });
        });

        txt.forEach(item => {
          if (result[item].length === 0) result[item].push({ score: 0, tt: null });
        });

        if (txtDegrCode) return trx.raw('DROP FUNCTION pg_temp.txt_degr(text)');
      });
    }

    function initializeQuery(trx, col) {
      const q = trx
        .select('tmp_norm.ttorig')
        .from('tmp_norm')
        .join(table, `${table}.${col}`, `tmp_norm.${col}`);

      if (!txtDegrCode) q.where(`${table}.lv`, obj.lv.lv);

      const sourceTable = joinSource(q);

      if (grp.length) {
        q.where(`${sourceTable}.ui`, '!=', array.notId(grp, 'ui'));
      }

      q
        .select(trx.raw(`grp_quality_score(array_agg(${sourceTable}.ui), array_agg(${sourceTable}.uq)) as score`))
        .groupBy('tmp_norm.ttorig');

      return q;
    }
  }
}

function joinSourceExpr(q) {
  q
    .join('dnx', 'dnx.ex', 'ex.ex');

  return 'dnx';
}

function joinSourceDefinition(q) {
  q
    .join('mn', 'mn.mn', 'df.mn')
    .join('ap', 'ap.ap', 'mn.ap');

  return 'ap';
}

function createTempExpr(trx, langvar, cb) {
  return trx.raw('CREATE TEMP TABLE ex ON COMMIT DROP AS SELECT ex, tt, pg_temp.txt_degr(tt) AS td FROM ex WHERE lv = ?', [langvar])
  .then(() => {
    return trx.raw('CREATE INDEX ON pg_temp.ex (td)');
  }).then(() => {
    return trx.raw('ANALYZE pg_temp.ex');
  }).then(() => {
    return cb(trx);
  });
}

function createTempDefinition(trx, langvar, cb) {
  return trx.raw('CREATE TEMP TABLE df ON COMMIT DROP AS SELECT mn, tt, pg_temp.txt_degr(tt) AS td FROM df WHERE lv = ?', [langvar])
  .then(() => {
    return trx.raw('CREATE INDEX ON pg_temp.df (td)');
  }).then(() => {
    return trx.raw('ANALYZE pg_temp.df');
  }).then(() => {
    return cb(trx);
  });
}

module.exports = {
  init: init
};
