const query = require('../query');
const should = require('should');
const config = require('../../config');

describe('langvar', function () {
  it('all', function (done) {
    query('/v2/langvar', {}, done,
    function (data) {
      data.result.length.should.equal(config.limit.responseMax);
      done();
    });
  });

  it('sorted by lang_code asc', function (done) {
    query('/v2/langvar', { sort: "lang_code", limit: 1 }, done,
    function (data) {
      data.result[0].lang_code.should.match(/^a/);
      done();
    });
  });

  it('sorted by lang_code desc', function (done) {
    query('/v2/langvar', { sort: "lang_code desc", limit: 1 }, done,
    function (data) {
      data.result[0].lang_code.should.match(/^z/);
      done();
    });
  });

  it('matching by id', function (done) {
    query('/v2/langvar', {id: [1, 2, 3]}, done,
    function (data) {
      data.result.length.should.equal(3);
      done();
    });
  });

  it('matching by uid', function (done) {
    query('/v2/langvar', {uid: ["eng-000", "eng-001", "eng-002", "eng-003", "spa-001"]}, done,
    function (data) {
      data.result.length.should.equal(5);
      done();
    });
  });

  it('matching by expr_txt', function (done) {
    query('/v2/langvar', {expr_txt: ["tree"]}, done,
    function (data) {
      (data.result.length > 5).should.be.true;
      (data.result.some (function (i) { return i.id === 187 })).should.be.true;
      done();
    });
  });

  it('matching by trans_expr', function (done) {
    query('/v2/langvar', {trans_expr: [441285]}, done,
    function (data) {
      (data.result.length > 30).should.be.true;
      (data.result.some (function (i) { return i.id === 157 })).should.be.true;
      done();
    });
  });

  it('matching by trans_expr', function (done) {
    query('/v2/langvar', {uid: ["kat-000", "mrg-999"], trans_expr: [441285]}, done,
    function (data) {
      data.result.length.should.equal(1);
      done();
    });
  });

  it('url param id', function (done) {
    query('/v2/langvar/187', done,
    function (data) {
      should.exist(data.langvar);
      data.langvar.lang_code.should.equal('eng');
      done();
    });
  });

  it('url param uid', function (done) {
    query('/v2/langvar/eng-000', done,
    function (data) {
      should.exist(data.langvar);
      data.langvar.id.should.equal(187);
      done();
    });
  });

  it('all params', function (done) {
    query('/v2/langvar', {
        expr_txt: 'English',
        expr_txt_degr: 'English',
        id: [1,2,3],
        include: ['denotation_count', 'expr_count', 'langvar_char', 'langvar_cldr_char', 'script_expr_txt'],
        lang_code: 'ind',
        meaning: 10,
        mutable: true,
        name_expr: 1000,
        name_expr_txt: 'English',
        name_expr_txt_degr: 'English',
        region_expr: 100,
        script_expr: 200,
        script_expr_txt: 'Latn',
        trans_expr: 500,
        uid: ['eng-000','spa-000'],
    },
    done,
    function (data) {
      should.exist(data.result);
      done();
    });
  });

  it('url param with include', function (done) {
    query('/v2/langvar/187', {
        include: ['denotation_count', 'expr_count', 'langvar_char', 'langvar_cldr_char', 'script_expr_txt'],
    },
    done,
    function (data) {
      should.exist(data.langvar);
      done();
    });
  });
});
