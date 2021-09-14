const query = require('../query');
const should = require('should');
const config = require('../../config');

describe('lv', function () {
  it('all', function (done) {
    query('/lv', {}, done,
    function (data) {
      data.result.length.should.equal(config.limit.responseMax);
      done();
    });
  });

  it('sorted by lang_code asc', function (done) {
    query('/lv', { sort: "lc", limit: 1 }, done,
    function (data) {
      data.result[0].lc.should.match(/^a/);
      done();
    });
  });

  it('sorted by lc desc', function (done) {
    query('/lv', { sort: "lc desc", limit: 1 }, done,
    function (data) {
      data.result[0].lc.should.match(/^z/);
      done();
    });
  });

  it('matching by id', function (done) {
    query('/lv', {lv: [1, 2, 3]}, done,
    function (data) {
      data.result.length.should.equal(3);
      done();
    });
  });

  it('matching by uid', function (done) {
    query('/lv', {uid: ["eng-000", "eng-001", "eng-002", "eng-003", "spa-001"]}, done,
    function (data) {
      data.result.length.should.equal(5);
      done();
    });
  });

  it('matching by expr_txt', function (done) {
    query('/lv', {extt: ["tree"]}, done,
    function (data) {
      (data.result.length > 5).should.be.true;
      (data.result.some (function (i) { return i.lv === 187 })).should.be.true;
      done();
    });
  });

  it('matching by trans_expr', function (done) {
    query('/lv', {trex: [441285]}, done,
    function (data) {
      (data.result.length > 30).should.be.true;
      (data.result.some (function (i) { return i.lv === 157 })).should.be.true;
      done();
    });
  });

  it('matching by trans_expr', function (done) {
    query('/lv', {uid: ["kat-000", "mrg-999"], trex: [441285]}, done,
    function (data) {
      data.result.length.should.equal(1);
      done();
    });
  });

  it('url param id', function (done) {
    query('/lv/187', done,
    function (data) {
      should.exist(data.lv);
      data.lv.lc.should.equal('eng');
      done();
    });
  });

  it('url param uid', function (done) {
    query('/lv/eng-000', done,
    function (data) {
      should.exist(data.lv);
      data.lv.lv.should.equal(187);
      done();
    });
  });

  it('all params', function (done) {
    query('/lv', {
        extt: 'English',
        extd: 'English',
        lv: [1,2,3],
        include: ['dncount', 'excount', 'cp', 'cu', 'sctt'],
        lc: 'ind',
        mn: 10,
        mu: true,
        ex: 1000,
        tt: 'English',
        td: 'English',
        rg: 100,
        sc: 200,
        sctt: 'Latn',
        trex: 500,
        uid: ['eng-000','spa-000'],
    },
    done,
    function (data) {
      should.exist(data.result);
      done();
    });
  });

  it('url param with include', function (done) {
    query('/lv/187', {
        include: ['dncount', 'excount', 'cp', 'cu', 'sctt'],
    },
    done,
    function (data) {
      should.exist(data.lv);
      done();
    });
  });
});
